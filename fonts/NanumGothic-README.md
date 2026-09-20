# OX textbook fonts

The three original criminal-law OX textbooks use NanumGothicBold for OX
question statements and NanumGothic for explanations. At the user's request,
the student OX view uses Bold (700) for both questions and explanations for
screen readability, while context remains Regular (400). These fonts apply
only to question, context and explanation content.

Source: https://github.com/google/fonts/tree/main/ofl/nanumgothic

- `NanumGothic-Regular.woff`: weight 400
- `NanumGothic-Bold.woff`: weight 700
- License: `NanumGothic-OFL.txt` (SIL Open Font License 1.1)

Downloaded on 2026-09-20. Converted the complete upstream TTF files to WOFF
with fontTools, without changing outlines or subsetting characters. Assets
are served locally and requested only when the corresponding OX content is shown.
