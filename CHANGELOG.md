# [1.2.0](https://github.com/wbern/lotta/compare/v1.1.3...v1.2.0) (2026-04-24)


### Features

* **publish:** repeat title on each alphabetical pairings page ([b3130ce](https://github.com/wbern/lotta/commit/b3130ce42d93f5894eaab554f1f36ae01643dd98))

## [1.1.3](https://github.com/wbern/lotta/compare/v1.1.2...v1.1.3) (2026-04-23)


### Bug Fixes

* **live:** stop club-scoping referees who never redeemed a club code ([63a4ace](https://github.com/wbern/lotta/commit/63a4ace85c828da9ac358eafc2adda0ba5185176))

## [1.1.2](https://github.com/wbern/lotta/compare/v1.1.1...v1.1.2) (2026-04-23)


### Bug Fixes

* **live:** broadcast state to peers after host undo/redo ([34df6da](https://github.com/wbern/lotta/commit/34df6da0468076cbdb556ef8605b6feb4ff334ee))

## [1.1.1](https://github.com/wbern/lotta/compare/v1.1.0...v1.1.1) (2026-04-22)


### Bug Fixes

* **live:** send state to peers who miss the initial push ([d73a8d5](https://github.com/wbern/lotta/commit/d73a8d5d9b5481e3816f04116c9c17d0b8b42929))

# [1.1.0](https://github.com/wbern/lotta/compare/v1.0.3...v1.1.0) (2026-04-21)


### Features

* **e2e-bridge:** expose DB export/restore for chaos-hunt roundtrip ([b687980](https://github.com/wbern/lotta/commit/b687980c31ee649dc15bfc649d9ecd7b841e4ccc))

## [1.0.3](https://github.com/wbern/lotta/compare/v1.0.2...v1.0.3) (2026-04-21)


### Bug Fixes

* **rollback:** rephrase warning to describe per-version DB isolation ([0524e79](https://github.com/wbern/lotta/commit/0524e798fc30aba51e81615af445d04275f8c808))

## [1.0.2](https://github.com/wbern/lotta/compare/v1.0.1...v1.0.2) (2026-04-21)


### Bug Fixes

* **ci:** harden release dispatch + rollback versions.json push ([6b51540](https://github.com/wbern/lotta/commit/6b515405bdab93e3e489428588863e09c8dc326d)), closes [#pages](https://github.com/wbern/lotta/issues/pages)
* **ui:** tighten WhatsNewDialog edge cases ([4dd687f](https://github.com/wbern/lotta/commit/4dd687f7e5c1b01237cd474d122148877b1dd203))

## [1.0.1](https://github.com/wbern/lotta/compare/v1.0.0...v1.0.1) (2026-04-21)


### Bug Fixes

* **ci:** dispatch rollback-deploy after semantic-release cuts a tag ([0f46892](https://github.com/wbern/lotta/commit/0f4689273a81c46899d6d4179cd9d09402c6aba6))

# 1.0.0 (2026-04-21)


### Bug Fixes

* **build:** use /v/<version>/ base for rollback bundles ([fdd0dda](https://github.com/wbern/lotta/commit/fdd0dda9508a3f1ebf6f0eb975c37a518c6d8270))
* **ci:** check out repo at default path so JamesIves can init git ([e5d9ff2](https://github.com/wbern/lotta/commit/e5d9ff292db2c7165a35a0ab69765de8a80abd40)), closes [#pages](https://github.com/wbern/lotta/issues/pages)
* flip result context menu upward near bottom of viewport ([71c32fa](https://github.com/wbern/lotta/commit/71c32fab80eca3f9864cae48eca7e5838d4b46ff))
* keep share button inline with club label in picker tree ([0d5f4be](https://github.com/wbern/lotta/commit/0d5f4be9dbcebdb573cd0f0c15bc370a0cb8416f))
* **live:** harden host-refreshing hint with role check and dedicated CSS ([3051a9c](https://github.com/wbern/lotta/commit/3051a9c4cf9810923c11264d7d32f36838d7f319))
* **live:** improve grant form accessibility and keyboard UX ([787f211](https://github.com/wbern/lotta/commit/787f211859951b999fdabfcb4d2dddb8f6efcdee))
* **live:** make LiveTab wrapper fill height so sharing panels can scroll ([1d70559](https://github.com/wbern/lotta/commit/1d70559a390054db5b7be6637635bac2cd4df141))
* **live:** revoking a grant deauthorizes already-connected peers ([4e2d51e](https://github.com/wbern/lotta/commit/4e2d51eaee38866cb62ab6c55d9e5990e2a3e011))
* **live:** show entered name in chat for Domare grants ([eb989dd](https://github.com/wbern/lotta/commit/eb989ddaa5653b08b903637da5242c00504978cc))
* **pairings:** adapt result keybinds to scoring system (lt-4aa) ([f121021](https://github.com/wbern/lotta/commit/f12102178a7f535576ad35f953df7b9e65d41573))
* **pairings:** only handle result-entry keys when a row has focus ([5f13489](https://github.com/wbern/lotta/commit/5f13489cd9b61c122a9d11df2e4db2527c894045))
* **players:** display player names as "FirstName LastName" in list dialogs ([6b85b58](https://github.com/wbern/lotta/commit/6b85b5839b8fd26837c1313ffd48159fa4cff3ab))
* **players:** sort alphabetically by first name, last name as tiebreak ([7e61c0f](https://github.com/wbern/lotta/commit/7e61c0f45ee26d000f32ce20fdd9a7d774d71181))
* **publish:** group Schackfyran alphabetical pairings by school class ([ba17332](https://github.com/wbern/lotta/commit/ba1733285e10c0e75d7699ce83367eb9dbf4805a))
* **tournament:** block scoring-system change once results are recorded ([22e4b93](https://github.com/wbern/lotta/commit/22e4b931d0f5f8703bd20e231790639498d8abf8))


### Features

* add "Lägg till grupp" flow for spawning tournament groups ([ce4f5e7](https://github.com/wbern/lotta/commit/ce4f5e7b4dc9c52f77eff0acac918e676dae268d))
* **build:** add rollback build flavor with namespaced DB and PWA identity ([8ab8d2b](https://github.com/wbern/lotta/commit/8ab8d2bdb98001b67dd63e5479a6498bdeb7da8b))
* **build:** generate versions.json manifest ([a37d931](https://github.com/wbern/lotta/commit/a37d93186f0a10ef67521385e268dfdff723a9e3)), closes [#pages](https://github.com/wbern/lotta/issues/pages) [#pages](https://github.com/wbern/lotta/issues/pages)
* **build:** skip VitePWA plugin in rollback builds ([8042077](https://github.com/wbern/lotta/commit/80420770d7e80d4bf989e6b66d16f12fc9bcb34f))
* club-code spectator view with per-club share dialog ([d963268](https://github.com/wbern/lotta/commit/d963268ef28f1f7e1caafca9a7b36eb7c758b8ea))
* initial public release ([ba130ae](https://github.com/wbern/lotta/commit/ba130aebc5d94b4521b4a49f589a9960efff9d84))
* **live:** add grants domain module ([295d077](https://github.com/wbern/lotta/commit/295d077ef266b629f935b85437cc397f81226b94))
* **live:** add native share button for spectator and grant links ([3ce2e4b](https://github.com/wbern/lotta/commit/3ce2e4b071e554f8c2ddb7f00e909ce6860fff1d))
* **live:** add native share button to club-code share dialog ([002bb0c](https://github.com/wbern/lotta/commit/002bb0cb67f83f735f55df2353363ed3c3fbe901))
* **live:** download PDFs for QR codes and simpler club-code sharing ([844bdef](https://github.com/wbern/lotta/commit/844bdef9a6d22d28f39952a13ada099a0aa2c2b5))
* **live:** host auto-resumes hosting on page load from saved session ([45b5185](https://github.com/wbern/lotta/commit/45b51851a5c5654bf3e2879351a08475bd77794b))
* **live:** host broadcasts 'refreshing' hint on pagehide for friendlier viewer UX ([e29568c](https://github.com/wbern/lotta/commit/e29568ca734e1e711dc10aaa75d577ca10fc6dce))
* **live:** mint stable hostId for host refresh recovery ([472bcf8](https://github.com/wbern/lotta/commit/472bcf89c6cbf1c56ac0983eb583af68c6c8e281))
* **live:** per-permission checkboxes for granting live access ([2e2759e](https://github.com/wbern/lotta/commit/2e2759ed9aac6c15af55ede6b3063bb13199ceb0))
* **live:** persist grants across session refresh and migrate legacy sessions ([aa6b8f0](https://github.com/wbern/lotta/commit/aa6b8f0d86c7e32132d3a0b4dbf22290d771979d))
* **live:** replace single-token Domarstyrning with grants list ([ec7133d](https://github.com/wbern/lotta/commit/ec7133da1b225bbc4efcacc36f54aa1ce8a9942c))
* **live:** revoke grants individually and deauthorize their tokens ([7836566](https://github.com/wbern/lotta/commit/7836566e5913de061ab314794c7c98b5d697a964))
* **live:** show disconnect button when connected to another host ([eb31c6a](https://github.com/wbern/lotta/commit/eb31c6ac5172f9709c07b0066990b162bf664ae0))
* **live:** viewer keeps host peer alive across refresh and rebinds by hostId ([30183fb](https://github.com/wbern/lotta/commit/30183fbde8df7c1e6357c8bd285673e805a6223e))
* **p2p:** host-wide club-code rate limit with escalating lockout ([fbd871b](https://github.com/wbern/lotta/commit/fbd871bd810afd21f99a39326a938d58429cb80a))
* **pairing:** guard round pairing with a 10s deadline ([a5bc399](https://github.com/wbern/lotta/commit/a5bc399f6f0632438d8bb109ca49a7c57ec52222))
* **pairings:** arrow keys move row selection and focus ([7819e28](https://github.com/wbern/lotta/commit/7819e2866476156aff172992c4f8015c8c68a294))
* **pairing:** show a "Lottar..." progress dialog with elapsed timer ([084e297](https://github.com/wbern/lotta/commit/084e297bb56b45945ede4cd941bbeb96451744cb))
* **pwa:** hide already-installed versions in Vad är nytt by default ([bd79415](https://github.com/wbern/lotta/commit/bd79415ba48b66a602287ba5d666d7eec4575e75))
* **pwa:** opt-in changelog view and working update check ([ccec15b](https://github.com/wbern/lotta/commit/ccec15b19fde577f4ee70755b4e3fb27372ebe4d))
* **pwa:** surface release changes in update prompt and menu ([5eaabf5](https://github.com/wbern/lotta/commit/5eaabf57d067d36f5267f665923f9470faad4e33))
* **rollback:** add version-picker dialog with forced export gate ([51446ab](https://github.com/wbern/lotta/commit/51446abfe4b8ba2722938163c1571c0a63699c35))
* **rollback:** replace forced-export gate with backup advisory warning ([b206dac](https://github.com/wbern/lotta/commit/b206dac04f4114d800d904a077a3ce95a62f22f8))
* seed test players into selected or random tournament ([821165a](https://github.com/wbern/lotta/commit/821165afe3a18e5041a7cc22fc674ec8ed7a1633))
* **sw:** runtime-cache rollback bundles under /v/** ([506b7df](https://github.com/wbern/lotta/commit/506b7df0d83d98208cfed37f8f61cf03ee180b5c))
