// commitlint.config.js
// Extends conventional. Restricts the type list to the project's
// canonical set (see CONTRIBUTING.md). Subject case is sentence-case
// to match our prior commits.

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'style', 'perf', 'build', 'ci'],
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'body-max-line-length': [1, 'always', 100],
    'footer-max-line-length': [1, 'always', 100],
  },
}
