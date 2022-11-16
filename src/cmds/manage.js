const fs = require('fs');
const path = require('path');
const glob = require('glob');
const config = require('config');
const { terminal } = require('terminal-kit');
const { readPosts } = require('../lib');
const { DefaultPostFormat, PostsPath } = require('../const');

const StatusesColored = {
  draft: '^CDraft',
  hidden: '^YHidden',
  published: '^RPublished'
};

function statusFromBools (draft, indexed) {
  if (draft) { return StatusesColored.draft; }
  if (!draft && !indexed) { return StatusesColored.hidden; }
  if (indexed) { return StatusesColored.published; }
}

const PADDING = 2;

module.exports = function manage () {
  let selected = 0;
  let menuSelect = 0;
  let toggles = [];
  let rows = [];
  const headers = ['', '', 'Timestamp', 'Title', 'Status', 'Path'];

  const readRows = () => {
    rows = readPosts().map(({ postDate, pathStub, meta: { title, draft, indexed } }) =>
      (['  ', '  ', postDate, title.replace('^', '^^'), statusFromBools(draft, indexed),
        !pathStub ? '-' : path.join(config.posts_out_path, pathStub)]));
    toggles.forEach((t, i) => (rows[i][1] = t));
  };

  function quit () {
    terminal.clear();
    terminal.reset();
    process.exit();
  }

  let enterToContinue; // eslint-disable-line prefer-const
  let reload;

  const toggle = (sel, i) => {
    toggles[i] = toggles[i] === TOGGLE_CHAR ? '' : TOGGLE_CHAR;
    return true;
  };

  const gatherToggles = () => {
    let toggled = toggles.map((x, i) => ([x, i])).filter(([x]) => x === TOGGLE_CHAR).map(([, i]) => i);
    if (!toggled.length) {
      toggled = [selected];
    }
    const filteredRows = rows.filter((x, i) => toggled.includes(i));
    const titles = filteredRows.map(x => x[3]);
    return { filteredRows, titles };
  };

  const TOGGLE_CHAR = '✅';
  const menuTuples = [
    ['Reload', reload],
    ...Object.entries(require('.'))
      .filter(([k, v]) => k !== path.parse(__filename).name)
      .sort(([ak], [bk]) => ak.localeCompare(bk))
      .map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/, ' $1'), v]),
    ['Change Status', (sel, i) => {
      const { filteredRows, titles } = gatherToggles();
      terminal(`Change following ${titles.length} posts...\n\n* ${titles.join('\n* ')}\n\nstatuses to:\n`);
      keyHandling = false;
      terminal.grabInput(false);
      terminal.singleColumnMenu(Object.values(StatusesColored).map(x => x.replace(/\^./, '')), {
        style: terminal.inverse,
        selectedStyle: terminal.dim.blue.bgGreen
      }, function (err, response) {
        const { selectedText } = response; // XXX: fix this, the awful if/elses below and the StatusesColored usage above together
        filteredRows.forEach(([,, ts]) => {
          const pPath = path.join(PostsPath, ts + '.json');
          const parsed = JSON.parse(fs.readFileSync(pPath));

          if (selectedText.toLowerCase() === 'draft') {
            parsed.draft = true;
            parsed.indexed = false;
          }
          else if (selectedText.toLowerCase() === 'hidden') {
            parsed.draft = false;
            parsed.indexed = false;
          } else if (selectedText.toLowerCase() === 'published') {
            parsed.draft = false;
            parsed.indexed = true;
          }

          fs.writeFileSync(pPath, JSON.stringify(parsed, null, 2));
          require('.').build();
          enterToContinue(null, false);
        });
      })
    }],
    ['Delete', (sel, i) => {
      const { filteredRows, titles } = gatherToggles();
      terminal(`Remove following ${titles.length} post(s)?\n\n* ${titles.join('\n* ')}\n`);
      enterToContinue(() => {
        filteredRows
          .flatMap(([,, ts]) => glob.sync(path.join(PostsPath, ts) + '*'))
          .forEach((killPath) => fs.rmSync(killPath));
        toggles = [];
        selected = 0;
      });
    }],
    ['Quit', quit]
  ];

  const newPostTuple = menuTuples.find(([k]) => k === 'New Post');
  let inputCapture = null;
  const origNewPost = newPostTuple[1];
  newPostTuple[1] = () => {
    terminal('Enter a title for the new post:  ');
    keyHandling = false;
    terminal.grabInput(false);
    terminal.inputField({}, function (err, input) {
      if (err) throw err;
      terminal.bgBlue('\n\n');
      origNewPost(input.split(/\s+/), { format: DefaultPostFormat });
      enterToContinue();
    });
  };

  const menu = Object.fromEntries(menuTuples);
  const menuStringMapper = (mapper) => ' '.repeat(PADDING) + Object.keys(menu).map(mapper).join('  ');

  function renderTable (selectedIncr = 0) {
    terminal.moveTo(1, 1);
    rows[selected][0] = '';
    selected = selected === 0 && selectedIncr === -1 ? rows.length - 1 : (selected + selectedIncr) % rows.length;
    rows[selected][0] = '👉';

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
    terminal.brightWhite().bgBrightBlack('');
  }

  let keyHandling = false;
  menu.Reload = menuTuples.find(([n]) => n === 'Reload')[1] = reload = () => {
    menuSelect = 0;
    terminal.clear();
    terminal.grabInput();
    readRows();
    renderTable();
  };

  enterToContinue = (beforeFunc, inclCancelMsg = true) => {
    terminal('\n\nENTER to continue' + (inclCancelMsg ? ', CTRL+C to cancel' : '') + '...');
    keyHandling = true;
    inputCapture = [[], () => {
      if (beforeFunc) {
        beforeFunc();
      }
      reload();
    }];
  };

  /*
  terminal.on('terminal', function (...a) {
    console.log('term event', a);
  }); */

  terminal.on('key', function (name, matches, { codepoint }) {
    if (!keyHandling) return;

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
        ESCAPE: () => {
          toggles = [];
          reload();
        },

        CTRL_C: quit,
        q: quit,
        Q: quit,

        CTRL_T: () => {
          toggle(rows[selected], selected);
          reload();
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
            enterToContinue(null, false);
          }
        }
      })[name]();
    } catch (e) {
      console.error(e);
    }
  });

  terminal.clear();
  keyHandling = true;
  terminal.grabInput();
  terminal.fullscreen();

  readRows();
  renderTable();
};

module.exports.helpText = {
  description: 'A management TUI'
};
