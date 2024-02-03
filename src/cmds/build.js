const fs = require('fs');
const path = require('path');
const { Feed } = require('feed');
const glob = require('glob');
const config = require('config');
const handlebars = require('handlebars');
const marked = require('marked');

const { PostsPath, OutPath } = require('../const');
const {
  readPosts,
  ignore,
  mkdirIgnore,
  dateToDisplayString,
  dateToFsString,
  writeSync
} = require('../lib');

function renderOneString (templateString, templateKey, centerKey, extraRenderVars = {}) {
  const localTemplateVars = { ...config.template_vars[templateKey] };
  if (centerKey === 'post') {
    delete localTemplateVars.main_content;
  }

  return handlebars.compile(templateString)(
    {
      ...localTemplateVars,
      ...extraRenderVars,
      posts_out_path: config.posts_out_path,
      metadata: config.metadata,
      toggles: config.toggles,
      links: config.links
    });
}

function render (centerTemplate, extraRenderVars = {}) {
  if (config.metadata.analytics) {
    extraRenderVars = {
      analytics: config.metadata.analytics,
      ...extraRenderVars
    };
  }

  return ['header', centerTemplate, 'footer'].reduce((a, tmplFileKey) => (a + '\n' +
    renderOneString(
      fs.readFileSync(path.join(path.resolve(config.templates_source_path), tmplFileKey + '.html')).toString('utf8'),
      tmplFileKey, centerTemplate, extraRenderVars)
  ), '');
}

function buildPost (postsOutPath, {
  meta,
  postDate,
  nd,
  postPath,
  pathStub
}) {
  const postTemplateVars = {
    timestamp: dateToDisplayString(nd),
    timestamp_native: dateToFsString(nd),
    title: meta.title,
    date: nd,
    pathStub,
    ...meta // is this needed?
  };

  mkdirIgnore(path.join(postsOutPath, postPath));
  postTemplateVars.content = renderOneString(fs.readFileSync(
    path.join(PostsPath, postDate + '.' + meta.format)).toString('utf8'),
  'post', 'post', postTemplateVars);

  if (meta.format === 'md') {
    postTemplateVars.content = marked.parse(postTemplateVars.content);
  }

  const OutPath = path.join(postsOutPath, pathStub);
  writeSync(OutPath, render('post', postTemplateVars), true);
  console.log(`${meta.draft ? 'Draft  ' : (meta.indexed ? 'Publish' : 'Hidden ')}  ->  ${OutPath}`);
  return meta.draft || !meta.indexed ? null : postTemplateVars;
}

function buildFeeds (postIndex) {
  const feed = new Feed({
    title: config.template_vars.header.main_title,
    author: config.metadata.author,
    link: config.metadata.site_fqdn,
    description: `${config.template_vars.header.main_title}: ${config.template_vars.header.sub_title}`
  });

  postIndex.forEach(({ title, date, pathStub }) => feed.addItem({
    date,
    title,
    author: config.metadata.author,
    link: `${config.metadata.site_fqdn}/${config.posts_out_path}/${pathStub}`
  }));

  Object.entries({
    rss: feed.rss2.bind(feed),
    xml: feed.rss2.bind(feed),
    json: feed.json1.bind(feed)
  })
    .filter(([feedType]) => config.feeds.includes(feedType))
    .forEach(([feedType, feedRender]) =>
      writeSync(path.join(OutPath, `feed.${feedType}`), feedRender()));
}

module.exports = function build () {
  ignore(() => {
    fs.rmSync(OutPath, { recursive: true });
    mkdirIgnore(OutPath);
  });

  console.log(`> Building posts sourced from ${PostsPath} in locale ${config.display_locale}...`);
  const postsOutPath = path.join(OutPath, config.posts_out_path);
  mkdirIgnore(postsOutPath);

  let postIndex = readPosts({ forBuilding: true })
    .map((postObj) => buildPost(postsOutPath, postObj))
    .filter(x => x !== null)
    .filter(x => delete x.content);

  if (config.toggles.reverse_chronology) {
    postIndex = postIndex.reverse();
  }

  writeSync(path.join(OutPath, 'index.html'), render('index', { postIndex }));

  console.log(`> Creating feeds with formats: ${config.feeds.join(', ')}...`);
  buildFeeds(postIndex);

  const staticsPath = path.resolve(config.static_source_path);
  console.log(`> Copying statics from ${staticsPath}...`);
  mkdirIgnore(path.join(OutPath, 'static'));
  glob.sync(path.join(staticsPath, '*')).forEach((staticFile) => {
    writeSync(path.join(OutPath, 'static', path.parse(staticFile).base), fs.readFileSync(staticFile));
  });
};

module.exports.helpText = {
  description: `Creates a new post stub of --format in ${config.posts_source_path}`
};

module.exports.yafssgOptions = {
  forceRedraw: true
};
