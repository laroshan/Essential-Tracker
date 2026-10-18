/**
 * Pure-TypeScript tests for the SMS engine (no React Native runtime needed).
 * Run with: npm run test:engine
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/smsEngine.test.ts'],
  transform: { '\\.[jt]sx?$': 'babel-jest' },
};
