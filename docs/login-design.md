# Login – Sonarfy

Reference: [Figma Login page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=75-20).

Inspected with Figma MCP: Light Desktop `84:328`, Light Mobile `84:370`, Dark Desktop `84:411`, Dark Mobile `84:453`. The context includes Header / Global `187:548` and Footer / Global `175:216`.

`get_variable_defs` returned no published variables for the Login section. CSS custom properties therefore use the exact resolved frame colors from `get_design_context`:

| Token | Light | Dark |
| --- | --- | --- |
| Page/input | #ffffff | #1a1a1a |
| Card | #ffffff | #242424 |
| Primary text | #1a1a1a | #ffffff |
| Secondary text | #65676b | #b2b3b5 |
| Card/header border | #ebecef | #65676b |
| Input/checkbox border | #8c8d90 | #8c8d90 |
| Accent | #27a9f5 | #27a9f5 |
| CTA text | #1a1a1a | #1a1a1a |
| CTA border | #1a1a1a | #27a9f5 |

Inter: heading 700, 32px/1.2 desktop and 28px/1.2 mobile; description 400, 15px/24px; labels 600, 14px/20px; inputs 400, 15px/24px desktop and 14px/24px mobile; options 13px/24px desktop and 12px/24px mobile; CTA 600, 15px/normal; account link 14px/24px; footer 12px/20px. The header mark is styled text and a circle in Figma; it is now exported as a complete SVG in `assets/logos/`.

Card: maximum 480px, 32px desktop padding; mobile outer margins/padding 24px, producing a 342px card at 390px. Sections and credentials use 24px gaps; labels use 8px gaps. Card radius 16px, controls 8px, checkbox 4px. No card shadow exists in these frames. Inset borders preserve Figma's content dimensions. Header height is 88px desktop / 80px mobile; footer minimum height 168px, top padding 32px, bottom padding 40px, gap 12px.

Requested copy deliberately overrides Figma's “Usuário” / “Digite o seu usuário” with “E-mail ou Nome de Usuário” / “seu@email.com ou @usuario”. Hover, active, focus, validation and loading states extend the inspected resting designs. The eye and arrow SVGs are in `assets/icons/login/`, and moon/sun SVGs in `assets/icons/shared/`; no temporary asset URLs are used at runtime.

The login loads its own stylesheet and theme controller to avoid conflicting legacy global styles, automatic footer injection and password character filtering. The theme uses the existing `sonarfy_theme` storage key. Existing API login, remembered identifier, verification feedback and redirects remain supported.

The existing recovery, legal and support link destinations are retained; their pages are absent from this repository. Figma does not define footer destinations. Existing `feed.html` is also absent. No new routes or backend endpoints are introduced.

Validation: `npm test` — 59 tests passed. Headless Firefox and Microsoft Edge screenshots of both themes at 1440×918 and 390×904 were visually inspected; Edge also passed overflow checks at 320×640 and 768×1024. Original SVGs load locally with their intrinsic dimensions. Rendering at the reference sizes places the desktop card at (480, 200), width 480, and mobile card at approximately (24, 155), width 342. Heights differ from rounded Figma values by less than 0.5px due to fractional text line heights. These checks use mocked API responses in the unit suite; no live authentication was performed.
