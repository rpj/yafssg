const fs = require('fs');
const path = require('path');
const glob = require('glob');
const config = require('config');
const { nanoid } = require('nanoid');
const { format } = require('date-fns');
const { PostsPath } = require('./const');
const { locale } = require(`date-fns/locale/${config.display_locale}`);

function dynRequireFrom (dir, addedCb, opts = { pathReplace: null }) {
  return fs.readdirSync(dir).reduce((a, dirEnt) => {
    const fPath = path.resolve(path.join(dir, dirEnt));
    const fParsed = path.parse(fPath);

    if (!fs.statSync(fPath).isDirectory() && fParsed.ext === '.js' && fParsed.name !== 'index') {
      if (addedCb) {
        addedCb(fPath);
      }

      if (opts.pathReplace) {
        fParsed.name = fParsed.name.replaceAll(opts.pathReplace.from, opts.pathReplace.to);
      }

      return {
        [fParsed.name]: require(fPath),
        ...a
      };
    }

    return a;
  }, {});
}

function ignore (func) { try { func(); } catch {} }
function mkdirIgnore (dir) { ignore(() => { fs.mkdirSync(dir, { recursive: true }); }); }
function writeSync (path, content, silent = false) {
  fs.writeFileSync(path, content);
  if (!silent) console.log(`Wrote ${path}`);
}

function dateToDisplayString (dateObj) { return format(dateObj, 'PPP', { locale }); }
function dateToFsString (dateObj) { return dateObj.toISOString().replaceAll(':', '_').replace(/\.\d+Z$/, ''); }
function dateFromFsString (fsDateString) { return new Date(fsDateString.replaceAll('_', ':') + '.000Z'); }

function readPosts ({ forBuilding } = {}) {
  return glob.sync(path.join(PostsPath, '*.json'), { windowsPathsNoEscape: true })
    .map((postMetaFile) => {
      const meta = JSON.parse(fs.readFileSync(postMetaFile));
      const postDate = path.parse(postMetaFile).name;
      const nd = dateFromFsString(postDate);
      const postPath = path.join(...[
        nd.getFullYear(),
        nd.getMonth() + 1,
        nd.getDate()
      ].map(x => String(x).padStart(2, '0')));
      const postName = meta.title.replaceAll(/[^\w\d-]+/g, '_');

      let pathStub = path.join(postPath, postName +
        (meta.draft ? '.' + nanoid() : '') + '.html');
      if (meta.draft && !forBuilding) {
        const outPathRes = path.join(path.resolve(config.output_path), config.posts_out_path);
        const expectPath = path.join(outPathRes, postPath, postName + '*.' + meta.format);
        const found = glob.sync(expectPath).map(x => x.replace(outPathRes + path.sep, ''));
        if (!found.length > 1) {
          throw new Error('bad!');
        }
        pathStub = found[0];
      }

      return {
        meta,
        postDate,
        nd,
        postPath,
        pathStub
      };
    })
    .sort((a, b) => a.postDate.localeCompare(b.postDate));
}

module.exports = {
  dynRequireFrom,

  ignore,
  mkdirIgnore,
  writeSync,

  dateToDisplayString,
  dateToFsString,
  dateFromFsString,

  readPosts
};
