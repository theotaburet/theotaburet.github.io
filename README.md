# theotaburet.github.io

Personal site, built with [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy).
Pushing to `main` builds and deploys via GitHub Actions — no local toolchain needed.

## Where things live

| What | File |
|---|---|
| Site title, tagline, avatar, social links | `_config.yml` |
| Colours and custom CSS | `assets/css/jekyll-theme-chirpy.scss` |
| Sidebar contact icons | `_data/contact.yml` |
| Landing page (served at `/`) | `_tabs/about.md` |
| CV | `_tabs/cv.md` |
| Publications | `_tabs/publications.md` |
| Projects | `_tabs/projects.md` |
| CV PDFs | `assets/pdf/` |
| Images | `assets/img/` |

Nav order is the `order:` field in each tab's front matter: about 1, cv 2,
publications 3, projects 4, then categories 5, tags 6, archives 7.

## Writing a post

Copy `_drafts/template.md` to `_posts/YYYY-MM-DD-some-slug.md` and edit it. The
template documents the front matter and the Chirpy-specific markdown (callouts,
maths, image options). Files in `_drafts/` are never published.

Posts are reachable from **Archives**, **Categories**, and **Tags**. There is no
blog index at `/` because that slot is the About page — see below.

## Restoring a blog home page

`/` currently serves `_tabs/about.md` via its `permalink: /`. To hand the root back
to the post feed:

1. Remove `permalink: /` from `_tabs/about.md`
2. Recreate `index.html` at the repo root:

   ```
   ---
   layout: home
   ---
   ```

`paginate: 10` is still set in `_config.yml`, so pagination resumes on its own.

## Previewing locally (optional)

Needs Ruby 3.x — the macOS system Ruby (2.6) is too old.

```bash
brew install rbenv && rbenv install 3.4.1 && rbenv local 3.4.1
bundle install
bundle exec jekyll s
```

Not required: the Actions build is the source of truth and takes ~40s.

## Colours

`assets/css/jekyll-theme-chirpy.scss` overrides Chirpy's palette. The accent is the
vermilion from the DCT lattice figure (`$sig-light` / `$sig-dark`), with the lattice
amber as the only secondary; neutrals are warmed to match. To change the whole
accent, edit those two variables — everything else is derived from them.

The overrides mirror Chirpy's own `:root[data-bs-theme=…]` selectors so the
light/dark toggle keeps working in both directions. Both accent values are checked
against WCAG AA on their backgrounds (5.5:1 light, 6.7:1 dark); if you swap them,
re-check.

Two helper classes are defined there: `.stack` for the tech chips under a project,
and `.deploys` for a project's live links.

## The DCT lattice figure

`assets/js/block-dependency-grid.js` renders the interactive grid on the Projects
page. Plain JS, no dependencies. It looks for `<div id="dct-grid"></div>` and does
nothing if that element is absent.
