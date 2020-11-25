const {math} = require('../../../config')
const ChangeTypes = require('../../ChangeTypes')
const Node = require('../../node')
const TreeSearch = require('../../TreeSearch')

// Searches through the tree, prioritizing deeper nodes, and evaluates
// arithmetic (e.g. 2+2 or 3*5*2) on an operation node if possible.
// Returns a Node.Status object.
const search = TreeSearch.postOrder(arithmetic)

// evaluates arithmetic (e.g. 2+2 or 3*5*2) on an operation node.
// Returns a Node.Status object.
function arithmetic(node) {
  if (!Node.Type.isOperator(node)) {
    return Node.Status.noChange(node)
  }
  if (!node.args.every(child => Node.Type.isConstant(child, true))) {
    return Node.Status.noChange(node)
  }

  // we want to eval each arg so unary minuses around constant nodes become
  // constant nodes with negative values
  node.args.forEach((arg, i) => {
    node.args[i] = Node.Creator.constant(arg.evaluate())
  })

  // Only resolve division of integers if we get an integer result.
  // Note that a fraction of decimals will be divided out.
  if (Node.Type.isIntegerFraction(node)) {
    const numeratorValue          = node.args[0].value
    const denominatorValue        = node.args[1].value
    const numeratorModDenominator = math.mod(numeratorValue, denominatorValue)

    if (math.equal(numeratorModDenominator, 0)) {
      const newNode = Node.Creator.constant(math.divide(numeratorValue, denominatorValue))
      return Node.Status.nodeChanged(
        ChangeTypes.SIMPLIFY_ARITHMETIC, node, newNode)

    } else {
      return Node.Status.noChange(node)
    }
  } else {
    const newNode = Node.Creator.constant(node.evaluate())
    return Node.Status.nodeChanged(ChangeTypes.SIMPLIFY_ARITHMETIC, node, newNode)
  }
}

module.exports = search
