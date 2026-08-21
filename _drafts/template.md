---
title: Post title goes here
description: One-line summary, shown in listings and in the SEO meta.
date: 2026-01-01 10:00:00 +0100
categories: [Research, Steganography]
tags: [jpeg, deep-learning]
math: true
image:
  path: /assets/img/prof_pic.jpg
  alt: Caption for the cover image.
---

To publish: rename this file to `_posts/YYYY-MM-DD-some-slug.md` and edit the front
matter above. Anything left in `_drafts/` is ignored by the build.

`categories` takes at most two entries (broad → narrow). `tags` takes as many as
you like, lowercase. Drop the `image:` block if the post has no cover.

## Chirpy syntax worth knowing

> A tip callout. Swap `.prompt-tip` for `.prompt-info`, `.prompt-warning`, or
> `.prompt-danger`.
{: .prompt-tip }

Maths works when `math: true` is set in the front matter: $P_E \geq 40\%$ at over
2 bpnzAC, and display equations too:

$$ \Sigma = \mathbb{E}\left[ (x - \mu)(x - \mu)^\top \right] $$

```python
# Code blocks get line numbers and a copy button automatically.
def embed(cover, payload):
    return cover
```

Images take the same options as the cover:

![Alt text](/assets/img/prof_pic.jpg){: width="400" .normal }

Footnotes[^1] and internal links to [the CV]({{ '/cv/' | relative_url }}) both work.

[^1]: Defined at the bottom of the file.
