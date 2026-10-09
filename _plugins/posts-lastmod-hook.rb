#!/usr/bin/env ruby
#
# Check for changed posts

Jekyll::Hooks.register :posts, :post_init do |post|

  commit_num = `git rev-list --count HEAD "#{ post.path }"`

  if commit_num.to_i > 1
    lastmod_date = `git log -1 --pretty="%ad" --date=iso "#{ post.path }"`
    post.data['last_modified_at'] = lastmod_date
  end

end

# Tabs and pages are dated by their last commit too, for the sitemap: without
# it the tabs carry the build time, as if every deploy changed them, and the
# French pages no date at all. Theme and generated pages have no history here.
Jekyll::Hooks.register [:tabs, :pages], :post_init do |page|

  lastmod_date = `git log -1 --pretty="%ad" --date=iso -- "#{ page.path }"`.strip
  page.data['last_modified_at'] = lastmod_date unless lastmod_date.empty?

end
