'use babel';

import { CompositeDisposable } from 'atom';
import SearchEngine from './search-engine';

export default {
    subscriptions: null,
    isActive: false,
    findAndReplace: null,
    projectFindView: null,
    prevScanWasWithPTSearch: false,

    activate() {
        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'pt-search:pt': () => this.pt()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'project-find:show': () => this.projectFindToggle(),
            'project-find:toggle': () => this.projectFindToggle()
        }));

        atom.packages.activatePackage('find-and-replace').then(findAndReplace => {
            this.findAndReplace = findAndReplace;
            this.projectFindView = findAndReplace.mainModule.projectFindView;
            if (!this.projectFindView) {
                return;
            }
            this.subscribeProjectFindView();
            this.overrideProjectFindModel();
            this.overrideProjectScan();
        })
    },

    deactivate() {
        this.subscriptions.dispose();
    },

    pt() {
        let target = document.querySelector('atom-workspace');
        if (atom.commands.dispatch(target, 'project-find:show')) {
            atom.packages.activatePackage('find-and-replace').then(() => {
                this.setActive(true);
            });
        }
    },

    projectFindToggle() {
        this.setActive(false);
    },

    setActive(active) {
        if (this.isActive === active) {
            return;
        }
        this.isActive = active;
        if (!this.projectFindView) {
            return;
        }
        if (active) {
            this.projectFindView.clearMessages();
            let infoMessage = this.projectFindView.refs.descriptionLabel.innerHTML
                .replace('Find in Project', 'Find in Project (with pt)');
            this.projectFindView.setInfoMessage(infoMessage);
            this.projectFindView.model.findOptions.ptSearch = true;
        } else {
            this.projectFindView.clearMessages();
            delete this.projectFindView.model.findOptions.ptSearch;
        }
    },

    subscribeProjectFindView: function() {
        this.subscriptions.add(atom.commands.add(this.projectFindView.element, {
            'core:close': () => this.searchClosed(),
            'core:cancel': () => this.searchClosed()
        }));
    },

    searchClosed() {
        this.setActive(false);
    },

    overrideProjectFindModel() {
        const modelShoudldRerunSearch = this.projectFindView.model.shoudldRerunSearch.bind(this.projectFindView.model);
        this.projectFindView.model.shoudldRerunSearch = (...args) => {
            if (this.prevScanWasWithPTSearch !== this.isActive) {
                return true;
            }
            return modelShoudldRerunSearch(...args);
        };
    },

    overrideProjectScan() {
        let workspaceScan = atom.workspace.scan.bind(atom.workspace);
        atom.workspace.scan = (...args) => this.scan(...args) || workspaceScan(...args);
    },

    scan(...args) {
        this.prevScanWasWithPTSearch = this.isActive;
        if (!this.isActive) {
            return undefined;
        }
        this.searching = true;
        setTimeout(() => this.setStatusMessage('Searching...'));
        let findOptions = this.projectFindView.model.findOptions;
        let promise = SearchEngine.scan(findOptions, ...args);
        promise.then(() => { this.searching = false; });
        return promise;
    },

    setStatusMessage(message) {
        if (!this.searching) {
            return;
        }
        const uri = 'atom://find-and-replace/project-results';
        let pane = atom.workspace.paneForURI(uri);
        if (!pane) {
            return;
        }
        let item = pane.itemForURI(uri)
        if (!item || !item.previewCount) {
            return;
        }
        item.previewCount.text(message)
    }
};
