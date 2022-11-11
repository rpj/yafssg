const fs = require('fs');
const path = require('path');
const util = require('util');
const config = require('config');
const handlebars = require('handlebars');

const { positionals, values, tokens } = util.parseArgs({
  allowPositionals: true
});

const [subCommand] = positionals;

Object.entries(config.template_vars).forEach(([key, val]) => {
  config.template_vars[key] = Object.entries(config.template_vars[key])
    .reduce((a, [iKey, iVal]) =>
      ({ [iKey]: iVal ?? `${iKey}<DEFAULT>`, ...a }), {});
});
console.log(Object.entries(config.template_vars));

({
  build: () => {
    const renderedIndex = ['header', 'footer'].reduce((a, tmplFileKey) => {
      console.log('parse!', tmplFileKey, path.parse(tmplFileKey));
      const renderer = handlebars.compile(fs.readFileSync(path.join(process.cwd(), 'templates', tmplFileKey + '.html')).toString('utf8'));
      return a + "\n" + renderer(config.template_vars[tmplFileKey]);
    }, '');

    console.log(renderedIndex);
  }
})[subCommand]();