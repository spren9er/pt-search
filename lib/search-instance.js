'use babel';

import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import SearchEnv from './search-env';

const LINE_REGEX = /^([^:]+):(\d+):(.+)$/;

class SearchInstance {
    constructor(findOptions, regex, options, iterator) {
        this.findOptions = findOptions;
        this.regex = regex;
        this.options = options;
        this.iterator = iterator;
        this.promise = new Promise(resolve => {
            this.resolve = resolve;
            this.initResultExclusions();
            this.runSearch();
        });
        this.promise.cancel = () => this.cancel();
    }

    initResultExclusions() {
        if (atom.config.get('core.excludeVcsIgnoredPaths')) {
            this.projectRepos = atom.project.getRepositories().filter(repo => repo);
        }
        let ignoredFiles = atom.config.get('core.ignoredNames');
        if (ignoredFiles && ignoredFiles.length) {
            this.ignoredFilesRegex = new RegExp('[\\\\/]' + ignoredFiles.map(f => '(' + this.pathToRegex(f) + ')').join('|'));
        }
    }

    runSearch() {
        let flags = ['-U', '--hidden', '--nogroup', '--nocolor', this.regex.source];
        flags = flags.concat(this.getSearchPaths());

        if (this.regex.ignoreCase) {
            flags.unshift('-i');
        }

        if (this.findOptions.wholeWord) {
            flags.unshift('-w');
        }

        this.startSearch(flags);
    }

    getSearchPaths() {
        let projectPaths = atom.project.getPaths();
        let searchPaths = this.options && this.options.paths || [];
        if (!searchPaths || !searchPaths.length) {
            return projectPaths;
        }
        let foundPaths = [];
        searchPaths.forEach(searchPath => {
            if (!searchPath) {
                return;
            }
            if (path.isAbsolute(searchPath)) {
                return foundPaths.push(searchPath);
            }
            let firstFolder = searchPath.split(/[\\\/]/)[0];
            let matchingProjectPaths = projectPaths.filter(pp => pp.endsWith(firstFolder));
            if (matchingProjectPaths.length) {
                foundPaths = foundPaths.concat(matchingProjectPaths
                    .map(pp => path.join(pp, searchPath.substr(firstFolder.length + 1)))
                );
            } else {
                foundPaths = foundPaths.concat(projectPaths
                    .map(pp => path.join(pp, searchPath))
                );
            }
        });
        return foundPaths;
    }

    pathToRegex(path) {
        return path
            .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
            .replace(/\*+/g, '.*')
            .replace(/"/g, '""');
    }

    startSearch(flags) {
        if (this.cancelled) {
            return this.resolve();
        }
        const cmd = path.join(SearchEnv.searchPath, 'pt');
        this.search = spawn(cmd, flags);
        this.search.unref();
        this.stdoutLineReader = readline.createInterface({ input: this.search.stdout });
        this.stderrLineReader = readline.createInterface({ input: this.search.stderr });
        this.stdoutLineReader.on('line', line => this.onOutLine(line));
        this.stderrLineReader.on('line', line => this.onErrLine(line));
        this.search.on('close', code => this.onSearchExit(code));
        this.search.on('error', err => this.onSearchError(err));
    }

    onSearchExit(code) {
        if (this.fileRes) {
            this.iterator(this.fileRes);
            this.fileRes = null;
        }
        if (this.stdoutLineReader) {
            this.stdoutLineReader.close();
            this.stdoutLineReader = null;
        }
        if (this.stderrLineReader) {
            this.stderrLineReader.close();
            this.stderrLineReader = null;
        }
        this.search = null;
        this.resolve();
    }

    onSearchError(err) {
        if (err && err.code === 'ENOENT') {
            atom.notifications.addError(
              '`pt` command not found, is it installed? \n' +
              'You can change the path in pt-search package settings!',
              { dismissable: true }
            );
        }
    }

    onOutLine(line) {
        const match = LINE_REGEX.exec(line);
        if (!match) {
            return;
        }
        const [, filePath, lineNumber, lineText] = match;
        if (lineText) {
            if (this.ignoredFilesRegex && this.ignoredFilesRegex.test(filePath)) {
                return;
            }
            if (this.projectRepos && this.projectRepos.some(repo => repo.isPathIgnored(filePath))) {
                return;
            }
            if (this.fileRes && this.fileRes.filePath !== filePath) {
                this.iterator(this.fileRes);
                this.fileRes = null;
            }
            if (!this.fileRes) {
                this.fileRes = {
                    filePath: filePath,
                    matches: []
                };
            }
            const row = lineNumber - 1;
            let lineMatch;
            do {
                lineMatch = this.regex.exec(lineText);
                if (lineMatch) {
                    this.fileRes.matches.push({
                        lineText: lineText,
                        lineTextOffset: 0,
                        matchText: lineMatch[0],
                        range: [[row, lineMatch.index],
                            [row, lineMatch.index + lineMatch[0].length]]
                    });
                }
            } while (lineMatch);
        }
    }

    onErrLine(line) {
        if (line.startsWith('open') && line.endsWith('no such file or directory')) {
            return;
        }
        this.iterator(undefined, { message: line });
    }

    cancel() {
        this.cancelled = true;
        if (this.stdoutLineReader) {
            this.stdoutLineReader.removeAllListeners('line');
        }
        if (this.search) {
            this.search.kill();
        }
    }
}

export default SearchInstance;
