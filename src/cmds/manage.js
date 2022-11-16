const fs = require('fs');
const path = require('path');
const glob = require('glob');
const config = require('config');
const { terminal } = require('terminal-kit');
const { readPosts } = require('../lib');
const { DefaultPostFormat, PostsPath } = require('../const');

function statusFromBools (draft, indexed) {
  if (draft) { return '^CDrafted'; }
  if (!draft && !indexed) { return '^YHidden'; }
  if (indexed) { return '^RPublished'; }
}

const PADDING = 2;

module.exports = function manage () {
  let selected = 0;
  let menuSelect = 0;
  const toggles = [];
  const headers = ['', '', 'Timestamp', 'Title', 'Status', 'Path'];
  let rows = [];

  const readRows = () => {
    rows = readPosts().map(({ postDate, pathStub, meta: { title, draft, indexed } }) =>
      (['', '', postDate, title.replace('^', '^^'), statusFromBools(draft, indexed),
        !pathStub ? '-' : path.join(config.posts_out_path, pathStub)]));
    toggles.forEach((t, i) => (rows[i][1] = t));
  };

  function quit () {
    terminal.clear();
    terminal.reset();
    process.exit();
  }

  let enterToContinue; // eslint-disable-line prefer-const

  const toggle = (sel, i) => {
    toggles[i] = toggles[i] === TOGGLE_CHAR ? '' : TOGGLE_CHAR;
    return true;
  };

  const TOGGLE_CHAR = '☑';
  const menuTuples = [
    ...Object.entries(require('.'))
      .filter(([k, v]) => k !== path.parse(__filename).name)
      .map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/, ' $1'), v]),
    ['Delete', (sel, i) => {
      let toggled = toggles.map((x, i) => ([x, i])).filter(([x]) => x === TOGGLE_CHAR).map(([, i]) => i);
      if (!toggled.length) {
        toggled = [i];
      }
      const filtRows = rows.filter((x, i) => toggled.includes(i));
      const titles = filtRows.map(x => x[3]);
      terminal(`Remove following ${titles.length} post(s)?\n\n* ${titles.join('\n* ')}\n`);
      enterToContinue(() => {
        filtRows
          .flatMap(([,, ts]) => glob.sync(path.join(PostsPath, ts) + '*'))
          .forEach((killPath) => fs.rmSync(killPath));
      });
    }],
    ['Quit', quit]
  ];

  const menu = Object.fromEntries(menuTuples);
  const menuStringMapper = (mapper) => ' '.repeat(PADDING) + Object.keys(menu).map(mapper).join('  ');

  function renderTable (selectedIncr = 0) {
    terminal.moveTo(1, 1);
    rows[selected][0] = '';
    selected = selected === 0 && selectedIncr === -1 ? rows.length - 1 : (selected + selectedIncr) % rows.length;
    rows[selected][0] = '>';

    const menuStr = menuStringMapper((x, i) => i === menuSelect ? `^+^[fg:white]^[bg:blue] ${x} ^[fg:blue]^[bg:white]` : ` ${x} `);
    const msLengther = menuStringMapper(x => ` ${x} `);
    const tBar = () => terminal.dim().bgWhite().blue();
    tBar()(menuStr + ' '.repeat(terminal.width - msLengther.length - 2 - PADDING) + '🍔' + ' '.repeat(PADDING) + '\n');
    // :frowning: TK has support for what I want to do properly but it's broken
    terminal.table([headers].concat(rows), {
      contentHasMarkup: true,
      firstRowTextAttr: { bgColor: 'blue' }
    });
    const postStatus = `${rows.length} posts in ${config.posts_source_path}`;
    tBar()(' '.repeat(terminal.width - postStatus.length - PADDING) +
      postStatus + ' '.repeat(PADDING) + '\n');
  }

  enterToContinue = (beforeFunc) => {
    terminal('\n\n<ENTER> to continue...');
    inputCapture = [[], () => {
      if (beforeFunc) {
        beforeFunc();
      }
      menuSelect = 0;
      readRows();
      renderTable();
    }];
  };

  const newPostTuple = menuTuples.find(([k]) => k === 'New Post');
  let inputCapture = null;
  const origNewPost = newPostTuple[1];
  newPostTuple[1] = () => {
    terminal('Enter a title for the new post:  ');
    inputCapture = [[], (buffer) => {
      terminal('\n');
      origNewPost(buffer.join('').split(/\s+/), { format: DefaultPostFormat });
      enterToContinue();
    }];
  };

  terminal.on('key', function (name, matches, { codepoint }) {
    try {
      if (inputCapture !== null) {
        const [buffer, next] = inputCapture;

        if (name === 'CTRL_C') {
          inputCapture = null;
          menuSelect = 0;
          terminal.clear();
          readRows();
          renderTable();
          return;
        }

        if (name === 'ENTER') {
          inputCapture = null;
          return next(buffer);
        }

        if (name === 'BACKSPACE') {
          buffer.pop();
          terminal('\x08');
          return;
        }

        const c = String.fromCodePoint(codepoint);
        buffer.push(c);
        terminal(c);
        return;
      }

      ({
        CTRL_C: quit,
        ESCAPE: quit,
        q: quit,
        Q: quit,

        CTRL_T: () => {
          toggle(rows[selected], selected);
          readRows();
          renderTable();
        },

        UP: () => renderTable(-1),
        DOWN: () => renderTable(1),

        LEFT: () => {
          menuSelect = menuSelect === 0 ? Object.keys(menu).length - 1 : menuSelect - 1;
          renderTable();
        },
        RIGHT: () => {
          menuSelect = (menuSelect + 1) % Object.keys(menu).length;
          renderTable();
        },

        ENTER: () => {
          const [, functor] = menuTuples[menuSelect];
          if (functor(rows[selected], selected) || functor?.yafssgOptions?.forceRedraw) {
            readRows();
            renderTable();
          }
        }
      })[name]();
    } catch (e) {
      console.error(e);
    }
  });

  terminal.clear();
  terminal.grabInput();
  terminal.fullscreen();

  readRows();
  renderTable();
};

module.exports.helpText = {
  description: 'A management TUI'
};
