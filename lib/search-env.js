'use babel';

class SearchEnv {
    static get searchPath() {
        return atom.config.get('pt-search.pt-path') || '/usr/local/bin';
    }
}

export default SearchEnv;
