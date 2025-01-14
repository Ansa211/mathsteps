const checks      = require('../checks')
const ChangeTypes = require('../ChangeTypes')

const simplifyCommon = require('./_common')
const kemuSortArgs   = require('./kemuSortArgs')

const clone = require('../util/clone')
const print = require('../util/print')

const MAX_STEP_COUNT = 64

// Pool of rules to apply.
const POOL_OF_RULES = [
  // Convert 3.14 to 314/100 etc. in non-numerical mode.
  require('./rules/convertDecimalToFraction'),

  // Apply logarithm rules before arithmetic to avoid huge intermediate
  // values like log10(10^23) => log10(100000000000000000000000)
  // We want log10(10^23) => 23 instead.
  require('./rules/commonFunctionsLogXY'),

  // Basic simplifications that we always try first e.g. (...)^0 => 1
  require('./rules/commonRules'),

  // x*a/x gives a
  require('./rules/cancelTerms'),

  // 3x + 2x gives 5x etc.
  require('./rules/collectLikeTerms'),

  // common function simplification e.g. sin(0) gives 0
  require('./rules/commonFunctions'),

  // (a + b + c + ...) * x gives ac ax + bx + cx + ... etc.
  require('./rules/distribute'),

  // sqrt(x^2) gives x or |x| (depends on domain)
  require('./rules/sqrtFromPow'),

  // sqrt(n) - calculate if possible.
  require('./rules/sqrtFromConstant'),

  // (a + b)^2 gives a^2 + 2ab + b^2 etc.
  require('./rules/multiplyShortFormulas'),

  // Numerical result e.g. 1.414 instead of sqrt(2).
  require('./rules/calculateNumericalValue')
]

function _applyRulesOnChildNode(fct, nodeBox, nodeIdx, simplifyCtx, nodeParent) {
  let isChanged = false

  if (simplifyCtx.iterIdx < MAX_STEP_COUNT) {
    // Apply simplify function on current node.
    let   node   = nodeBox[nodeIdx]
    const status = fct(node, simplifyCtx, nodeParent)

    if (status) {
      // Current node changed.
      // Report simplify step.
      isChanged        = true
      nodeBox[nodeIdx] = status.rootNode

      // Track last changed node.
      // We'll start next simplify step from this node.
      simplifyCtx.lastChangedNodeBox    = nodeBox
      simplifyCtx.lastChangedNodeIdx    = nodeIdx
      simplifyCtx.lastChangedNodeParent = nodeParent
      simplifyCtx.onStepCb(status)

    } else if (node.args) {
      // Nothing changed on current node.
      // Go into child nodes recursively.
      for (let argIdx in node.args) {
        isChanged |= _applyRulesOnChildNode(fct, node.args, argIdx, simplifyCtx, node)
      }
    }
  }

  return isChanged
}

function _replaceChildNodeAfterClone(originalRoot, clonedRoot, nodeToBeReplaced, nodeToPut) {
  let rv = clonedRoot

  if (originalRoot == nodeToBeReplaced) {
    rv = nodeToPut

  } else if (originalRoot.args) {
    for (let idx in originalRoot.args) {
      clonedRoot.args[idx] = _replaceChildNodeAfterClone(
        originalRoot.args[idx],
        clonedRoot.args[idx],
        nodeToBeReplaced,
        nodeToPut
      )
    }
  }

  return rv
}

// Given a mathjs expression node, steps through simplifying the expression.
// Returns a list of details about each step.
function stepThrough(node, options = {}) {
  if (options.isDebugMode) {
    // eslint-disable-next-line
    console.log('\n\nSimplifying: ' + print.ascii(node));
  }

  //
  // Pre-process node.
  //

  node = simplifyCommon.kemuFlatten(node)

  // Add hard-coded first step with original expression.
  if (options.onStepCb) {
    options.onStepCb({
      changeType: ChangeTypes.KEMU_ORIGINAL_EXPRESSION,
      rootNode: clone(node),
    })
  }

  if (!checks.hasUnsupportedNodes(node)) {
    //
    // Set-up simplify context passed along all steps.
    //

    const simplifyCtx = {
      iterIdx: 0,
      rootNode: node,
      expressionCtx: options.expressionCtx,

      // Callback called when any part of expression (node) changed.
      // We use it to track/collect steps.
      onStepCb: (stepMeta) => {
        // Validate step fields.
        if (!stepMeta.changeType) {
          throw 'missing change type'
        }
        if (!stepMeta.rootNode) {
          throw 'missing root node'
        }

        if (options.isDebugMode) {
          logSteps(stepMeta)
        }

        simplifyCtx.rootNode = simplifyCommon.kemuFlatten(simplifyCtx.rootNode)
        simplifyCtx.rootNode = simplifyCommon.kemuNormalizeConstantNodes(simplifyCtx.rootNode)
        simplifyCtx.iterIdx++

        // Possible improvement: Optimize it.
        if (stepMeta.altForms) {
          stepMeta.altForms.forEach((oneAltForm) => {
            const altFormNodeRoot  = clone(oldNode)
            const nodeToBeReplaced = simplifyCtx.lastChangedNodeBox[simplifyCtx.lastChangedNodeIdx]
            const nodeToPut        = oneAltForm.node

            // Build whole altForm node by clonning root and replace changed
            // node only.
            oneAltForm.node = _replaceChildNodeAfterClone(
              simplifyCtx.rootNode,
              altFormNodeRoot,
              nodeToBeReplaced,
              nodeToPut
            )
          })
        }

        stepMeta.rootNode = clone(simplifyCtx.rootNode)
        oldNode = stepMeta.rootNode

        if (options.onStepCb) {
          options.onStepCb(stepMeta)
        }
      }
    }

    //
    // Apply simplify rules to the expression.
    //

    const originalNode = clone(node)
    let   oldNode      = originalNode
    let   goOn         = true

    let isShuffled = false
    let expressionAsTextAfterShuffle = null

    // Step through the math expression until nothing changes.
    while (goOn) {
      goOn = false

      // Process last changed node or root.
      const nodeBox    = simplifyCtx.lastChangedNodeBox || simplifyCtx
      const nodeIdx    = simplifyCtx.lastChangedNodeIdx || 'rootNode'
      const nodeParent = simplifyCtx.lastChangedNodeParent

      // Apply common rules first.
      for (let ruleIdx in POOL_OF_RULES) {
        const fct = POOL_OF_RULES[ruleIdx]
        if (_applyRulesOnChildNode(fct, nodeBox, nodeIdx, simplifyCtx, nodeParent)) {
          goOn       = true
          isShuffled = false
          break
        }
      }

      // Back to root if child node went to dead-end.
      if (!goOn && simplifyCtx.lastChangedNodeBox) {
        // Reset current node to the root.
        goOn = true
        simplifyCtx.lastChangedNodeBox    = null
        simplifyCtx.lastChangedNodeIdx    = null
        simplifyCtx.lastChangedNodeParent = null
      }

      // Try refactor whole expression from scratch if still dead-end.
      if (!goOn && !isShuffled) {
        // Rebuild expression from the scratch.
        const mathsteps  = require('../../index.js')
        const exprAsText = print.ascii(simplifyCtx.rootNode)

        if (expressionAsTextAfterShuffle !== exprAsText) {
          // Try shuffle only once after each dead-end.
          isShuffled = true
          goOn       = true

          // Reset current node to the root.
          simplifyCtx.lastChangedNodeBox    = null
          simplifyCtx.lastChangedNodeIdx    = null
          simplifyCtx.lastChangedNodeParent = null
          simplifyCtx.rootNode              = mathsteps.parseText(exprAsText)

          expressionAsTextAfterShuffle = exprAsText
        }
      }

      // Limit iterations to avoid potentially hung-up.
      if (simplifyCtx.iterIdx === MAX_STEP_COUNT) {
        // eslint-disable-next-line
        console.error('Math error: Potential infinite loop for expression: ' + print.ascii(originalNode))
        goOn = false
      }
    }

    //
    // Post-process node.
    //

    node = oldNode

    // Possible improvement: Optimize it.
    const newNode       = kemuSortArgs(clone(oldNode))
    const oldNodeAsText = print.ascii(oldNode)
    const newNodeAsText = print.ascii(newNode)

    if (oldNodeAsText !== newNodeAsText) {
      if (options.onStepCb) {
        options.onStepCb({
          changeType: ChangeTypes.REARRANGE_COEFF,
          rootNode: newNode,
        })
      }
      node = newNode
    }
  }

  return node
}

function logSteps(nodeStatus) {
  // eslint-disable-next-line
  console.log(nodeStatus.changeType);
  // eslint-disable-next-line
  console.log(print.ascii(nodeStatus.rootNode));

  if (nodeStatus.substeps.length > 0) {
    // eslint-disable-next-line
    console.log('substeps: ');
    nodeStatus.substeps.forEach((substep, idx) => {
      console.log('...', idx, '|', print.ascii(substep.rootNode))
    })
  }
}

module.exports = {
  oldApi: function (node, options = {}) {
    const steps = []

    stepThrough(node, {
      isDebugMode: options.isDebugMode,
      expressionCtx: options.expressionCtx,
      onStepCb: (oneStep) => {
        steps.push(oneStep)
      }
    })

    return steps
  },

  newApi: function (node, options = {}) {
    return stepThrough(node, options)
  }
}
