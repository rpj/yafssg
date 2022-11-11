const fs = require('fs');
const path = require('path');
const config = require('config');
const { PostsPath } = require('../const');
const { mkdirIgnore, dateToFsString } = require('../lib');

module.exports = function newPost (args, { format }) {
  mkdirIgnore(PostsPath);
  const datestr = dateToFsString(new Date());
  fs.writeFileSync(path.join(PostsPath, datestr + '.json'), JSON.stringify({
    title: args.join(' '),
    draft: true,
    indexed: false,
    format
  }, null, 2));
  fs.writeFileSync(path.join(PostsPath, datestr + '.' + format), '');
  console.log(`New draft post created as ${path.join(PostsPath, datestr + `.{${format},json}`)}`);
};

module.exports.helpText = {
  description: `Builds the site into ${config.output_path} from ${config.posts_source_path} & ${config.static_source_path}`
};
