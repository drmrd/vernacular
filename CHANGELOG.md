# Changelog

All notable changes to Vernacular are tracked here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Vernacular will follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
beginning with version 1.0.0. Prior to 1.0.0, the API and data formats are
unstable and may change without backwards compatibility.

Starting in Phase 0e, this file is maintained automatically by
`release-please` from Conventional Commit messages. Until then, entries
are added by hand and intentionally coarse-grained (one bullet per phase).

## 0.1.0 (2026-06-02)


### Features

* bootstrap build foundation ([8c36dda](https://github.com/drmrd/vernacular/commit/8c36dda76dac5d503173d4a7e3c3b9854df31ced))
* **claude:** add CLAUDE.md, rules, six subagents, seven commands ([c0c60f2](https://github.com/drmrd/vernacular/commit/c0c60f2419cfa65a1a254086cd62c2c3c8a4d802))
* **knowledge:** stand up the knowledge graph foundation ([229e547](https://github.com/drmrd/vernacular/commit/229e5471c007e7b700c17096b84fa04ad5405bf8))


### Bug fixes

* add main landmark to App shell for axe compliance ([418b817](https://github.com/drmrd/vernacular/commit/418b8179496748c48bca58713c25176720128cc5))
* **ci:** keep Prettier from rewriting the auto-generated index files ([a166404](https://github.com/drmrd/vernacular/commit/a166404985508ee50b95515d80336ccb2e9e705f))
* **docs:** strip TOML front matter from CODE_OF_CONDUCT.md ([b006d41](https://github.com/drmrd/vernacular/commit/b006d41c2f59df3cf4fbd4c6af3a6a31f0490054))
* **release:** bootstrap first release to 0.1.0 ([e586038](https://github.com/drmrd/vernacular/commit/e58603883c77e33e97128341c4622531a97df307))
* **release:** bootstrap first release to v0.1.0 ([681c447](https://github.com/drmrd/vernacular/commit/681c4472c1960b8057eb5fec7e47d43f3cf9e10b))
* **release:** bump pre-major versions instead of jumping to 1.0.0 ([22a00e7](https://github.com/drmrd/vernacular/commit/22a00e753b0839b6e089d608ded350c711846d29))
* **release:** keep pre-major bumps before the first 1.0 cut ([67303d7](https://github.com/drmrd/vernacular/commit/67303d70afcf8aa58f465704618a5439d7f0dc94))


### Refactoring

* **ci:** rename job for intent-revealing name ([4a39bd2](https://github.com/drmrd/vernacular/commit/4a39bd243077188e31142993bd316633eb31b81d))


### Documentation

* add documentation surface ([ada7037](https://github.com/drmrd/vernacular/commit/ada70373293a00d4b261468eb6ca3402ce6e12a8))
* add implementation plan for Lighthouse CI, Stryker, fixtures, factories ([70dce8c](https://github.com/drmrd/vernacular/commit/70dce8c21143b1e8742af6cf8bb32de9999fde03))
* document Lighthouse CI and mutation testing workflows ([6411384](https://github.com/drmrd/vernacular/commit/64113843b3f41a62bef4322c9d1cb6c8ec2efe86))
* document Storybook, Playwright, and visual-regression baseline workflow ([4ce88e8](https://github.com/drmrd/vernacular/commit/4ce88e81e4b079b36178855ee0c63c55ae21a374))
* implementation plan for Storybook, Playwright, axe-core, and visual regression ([fa3f203](https://github.com/drmrd/vernacular/commit/fa3f203f0ea4971d1f99fcb2b951fd3adf3f34cc))
* implementation plan for the build foundation ([22caccc](https://github.com/drmrd/vernacular/commit/22caccc240c27b3ba0e43c22280a81000943e75f))
* implementation plan for the Claude Code infrastructure ([ce79158](https://github.com/drmrd/vernacular/commit/ce79158819e41e66d56c122043f8ce883fd7c256))
* implementation plan for the documentation surface ([8cf6e30](https://github.com/drmrd/vernacular/commit/8cf6e30504302f74aa0fbdc1481edfd724bd1633))
* implementation plan for the hooks and release engineering ([03c10ab](https://github.com/drmrd/vernacular/commit/03c10ab80e8e97de30a0a16fa487f101d026195b))
* implementation plan for the knowledge graph foundation ([e187e7a](https://github.com/drmrd/vernacular/commit/e187e7ae30a7de3fd42b5f8a4ea8f50f6960c98a))
* implementation plan for the lint expansion ([3908e37](https://github.com/drmrd/vernacular/commit/3908e37cac87f32e1bf07f2cf64f9d1dbfc2cf14))
* initial design specification for Home Layout Legend ([dd141c4](https://github.com/drmrd/vernacular/commit/dd141c4553274f51d6f3f5f13fb2ede0a386cf4c))


### Tests

* add Lighthouse CI config for production-preview budgets ([711d72f](https://github.com/drmrd/vernacular/commit/711d72fc39a22b6240737f968ec54941e6553a3d))
* add Playwright config and smoke, axe, visual-regression tests ([bc2cabf](https://github.com/drmrd/vernacular/commit/bc2cabfb78b7530682e5b6a616a1cf78ffa461e5))
* add Storybook config and starter App.Shell story ([fb3816b](https://github.com/drmrd/vernacular/commit/fb3816b9100b4d53db51e8f80fa5db6210ee5b51))
* add Stryker config targeting core/ with the Vitest runner ([be5886b](https://github.com/drmrd/vernacular/commit/be5886bdc07173eabb88d89e00374dfb3ffe6efc))
* scaffold tests/fixtures and tests/factories directories ([c441223](https://github.com/drmrd/vernacular/commit/c44122361012dc25c9c61a6a26227b48c5d164bc))
* skip visual regression when no baseline exists for the runner platform ([0b17310](https://github.com/drmrd/vernacular/commit/0b17310279adc3d5f01d25a1865e698bda9dfa7e))


### Build

* add Lighthouse CI and Stryker devDeps ([80f0768](https://github.com/drmrd/vernacular/commit/80f076863b86e3885536fd373b725e2d282290c7))
* add Storybook, Playwright, axe-core, and rollup cooldown override ([d9a828e](https://github.com/drmrd/vernacular/commit/d9a828e79549d57183206ff0b65d913a49b871ae))


### CI

* add Lighthouse CI job and weekly Stryker workflow ([360675e](https://github.com/drmrd/vernacular/commit/360675e63ab07d7059a3dcfa515f7785bad10c23))
* add Storybook build and Playwright (chromium) jobs ([7bdf687](https://github.com/drmrd/vernacular/commit/7bdf68757dc57b9e38d9f7665f5605b22193bd04))


### Chores

* **deps:** require 15-day cooldown on all package installs ([6c5c0ac](https://github.com/drmrd/vernacular/commit/6c5c0acdd2dcc3bc5d121e98f241e78a181c43ed))
* drop cryptic milestone identifiers and competitor names; gitignore knowledge graph ([63fe1a3](https://github.com/drmrd/vernacular/commit/63fe1a3c644c9f6a60d19c848e5b5d6fe94051b8))
* exclude e2e tests from Vitest; ignore Playwright/Storybook artifacts in ESLint ([d8f8e19](https://github.com/drmrd/vernacular/commit/d8f8e19d01e31fe71dccd77555d5689c75ec805d))
* **hooks:** add Husky, commitlint, lint-staged, release-please ([89cff59](https://github.com/drmrd/vernacular/commit/89cff591353b8e927122679aec54bce6f15e1c99))
* ignore Lighthouse CI, Stryker, and workflow boilerplate ([c093201](https://github.com/drmrd/vernacular/commit/c0932016a5d4c32ac1fd342830434047ba931d26))
* **lint:** expand ESLint to the full Clean Code guardrail set ([17581cf](https://github.com/drmrd/vernacular/commit/17581cf44e4daaddcd6641213f23789cbbde20a6))
* rename project to Vernacular ([bf04ec4](https://github.com/drmrd/vernacular/commit/bf04ec41fc98ab43f87897614f5576cb80306e2a))
* resolve &lt;TBD-org&gt; placeholder in NOTICE to drmrd ([d2b723c](https://github.com/drmrd/vernacular/commit/d2b723c92915ce7baddd065ce9d38af826ce15b4))

## [Unreleased]

### Added

- Phase 0b: documentation surface (`CHANGELOG.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CONTRIBUTING.md`).
- Phase 0a: build foundation. TypeScript strict mode, Vite, React 18,
  Vitest with Testing Library, ESLint flat config, Prettier, Apache-2.0
  license and NOTICE, minimal README, first GitHub Actions CI workflow,
  initial App component built via a red-green-blue TDD cycle.
