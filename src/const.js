const path = require('path');
const config = require('config');

module.exports = {
  PostsPath: path.resolve(config.posts_source_path),
  OutPath: path.join(process.cwd(), config.output_path),

  DefaultPostFormat: 'md',
  AllowedPostFormats: ['md', 'html'],

  HelpTabDistance: 15
};
