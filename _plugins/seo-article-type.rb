# Jekyll dates every document of a collection, so jekyll-seo-tag calls the tabs
# articles (og:type and article:published_time, at the build time) while their
# French twins, plain pages, are websites. Only posts are articles.
require "jekyll-seo-tag"

Jekyll::SeoTag::Drop.prepend(Module.new do
  def date_published
    super if page["collection"] == "posts"
  end
end)
