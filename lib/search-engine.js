'use babel';

import SearchInstance from './search-instance';

class SearchEngine {
    static scan(findOptions, regex, options, iterator) {
        if (typeof options === 'function') {
            iterator = options;
            options = null;
        }
        let search = new SearchInstance(findOptions, regex, options, iterator);
        return search.promise;
    }
}

export default SearchEngine;
