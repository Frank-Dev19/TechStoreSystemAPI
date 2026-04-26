const { default: tsJest } = require('ts-jest');

module.exports = tsJest.createTransformer({
  tsconfig: 'tsconfig.spec.json',
});
