const cancelLikeTerms = require('../../../lib/simplifyExpression/fractionsSearch/cancelLikeTerms')

const TestUtil = require('../../TestUtil')

function testCancelLikeTerms(exprStr, expectedStr) {
  TestUtil.testSimplification(cancelLikeTerms, exprStr, expectedStr)
}

describe('cancel like terms', function () {
  const tests = [
    ['2/2', '1'],
    ['x^2/x^2', '1'],

    // -------------------------------------------------------------------------
    // Cases from al_stepper_stuck
    ['x^3/x^2', 'x'], // parens will be removed at end of step
    ['(x^3*y)/x^2', 'x * y'],
    //['-(7+x)^8/(7+x)^2', '-(7 + x)^6'],
    //['(2x^2 * 5) / (2x^2)', '5'], // these parens have to stay around 2x^2 to be parsed correctly.
    ['(x^2 * y) / x', 'x * y'],
    //['2x^2 / (2x^2 * 5)', '1/5'],
    //['x / (x^2*y)', 'x^(1 - (2)) / y'],
    ['(4x^2) / (5x^2)', '4/5'],
    ['(2x+5)^8 / (2x+5)^2', '(2x + 5)^6'],
    ['(4x^3) / (5x^2)', '4x / 5'],
    // -------------------------------------------------------------------------

    // TODO: Review it.
    // TODO: These tests are overwriten above.
    ['x^3/x^2', 'x^(3 - (2))'], // parens will be removed at end of step
    ['(x^3*y)/x^2', '(x^(3 - (2)) * y)'],
    ['-(7+x)^8/(7+x)^2', '-(7 + x)^(8 - (2))'],
    ['(2x^2 * 5) / (2x^2)', '5'], // these parens have to stay around 2x^2 to be parsed correctly.
    ['(x^2 * y) / x', '(x^(2 - (1)) * y)'],
    ['2x^2 / (2x^2 * 5)', '1/5'],
    ['x / (x^2*y)', 'x^(1 - (2)) / y'],
    ['(4x^2) / (5x^2)', '(4) / (5)'],
    ['(2x+5)^8 / (2x+5)^2', '(2x + 5)^(8 - (2))'],
    ['(4x^3) / (5x^2)', '(4x^(3 - (2))) / (5)'],
    ['-x / -x', '1'],
    ['2/ (4x)', '1 / (2x)'],

    ['2/ (4x^2)', '1 / (2x^2)'],
    ['2 a / a', '2'],
    ['(35 * nthRoot (7)) / (5 * nthRoot(5))','(7 * nthRoot(7)) / nthRoot(5)'],
    ['3/(9r^2)', '1 / (3r^2)'],
    ['6/(2x)', '3 / (x)']
  ]

  tests.forEach(t => {
    const before = t[0]
    const after = t[1]
    it(before + ' -> ' + after, function () {
      testCancelLikeTerms(before, after)
    })
  })
})
