(function() {

'use strict';

angular.module('superdesk.itemList', [])
.service('itemListService', ['api', function(api) {
    var DEFAULT_OPTIONS = {
        endpoint: 'search',
        pageSize: 25,
        page: 1,
        sort: [{versioncreated: 'desc'}]
    };
    var getQuery = function(options) {
        var query = {source: {query: {filtered: {}}}};
        // process filter aliases and shortcuts
        if (options.sortField && options.sortDirection) {
            var sort = {};
            sort[options.sortField] = options.sortDirection;
            options.sort = [sort];
        }
        if (options.repo) {
            options.repos = [options.repo];
        }
        // add shared query structure
        if (
            options.types ||
            options.notStates ||
            options.states ||
            options.creationDateBefore ||
            options.creationDateAfter ||
            options.modificationDateBefore ||
            options.modificationDateAfter ||
            options.provider ||
            options.source ||
            options.urgency
        ) {
            query.source.query.filtered.filter = {and: []};
        }
        // process page and pageSize
        query.source.size = options.pageSize;
        query.source.from = (options.page - 1) * options.pageSize;
        // process sorting
        query.source.sort = options.sort;
        // process repo
        if (options.repos) {
            query.repo = options.repos.join(',');
        }
        // process types
        if (options.types) {
            query.source.query.filtered.filter.and.push({terms: {type: options.types}});
        }
        // process notState
        if (options.notStates) {
            _.each(options.notStates, function(notState) {
                query.source.query.filtered.filter.and.push({not: {term: {state: notState}}});
            });
        }
        // process state
        if (options.states) {
            var stateQuery = [];
            _.each(options.states, function(state) {
                stateQuery.push({term: {state: state}});
            });
            query.source.query.filtered.filter.and.push({or: stateQuery});
        }
        // process creation date
        _.each(['creationDate', 'modificationDate'], function(field) {
            if (options[field + 'Before'] || options[field + 'After']) {
                query.source.query.filtered.filter.and.push({range: {firstcreated: {
                    lte: options[field + 'Before'] || undefined,
                    gte: options[field + 'After'] || undefined
                }}});
            }
        });
        // process provider, source, urgency
        _.each(['provider', 'source', 'urgency'], function(field) {
            if (options[field]) {
                var directQuery = {};
                directQuery[field] = options[field];
                query.source.query.filtered.filter.and.push({term: directQuery});
            }
        });

        // process search
        var fields = {
            headline: 'headline',
            subject: 'subject.name',
            keyword: 'slugline',
            uniqueName: 'unique_name',
            body: 'body_html'
        };
        var queryContent = [];
        _.each(fields, function(dbField, field) {
            if (options[field]) {
                queryContent.push(dbField + ':(' + options[field] + ')');
            }
        });
        if (queryContent.length) {
            query.source.query.filtered.query = {
                query_string: {
                    query: queryContent.join(' '),
                    lenient: false,
                    default_operator: 'AND'
                }
            };
        }
        // process search
        if (options.search) {
            var queryContentAny = [];
            _.each(_.values(fields), function(dbField) {
                queryContentAny.push(dbField + ':(' + options.search + ')');
            });
            query.source.query.filtered.query = {
                query_string: {
                    query: queryContentAny.join(' '),
                    lenient: false,
                    default_operator: 'OR'
                }
            };
        }

        return query;
    };
    this.fetch = function(options) {
        options = _.extend(DEFAULT_OPTIONS, options);
        var query = getQuery(options);
        return api(options.endpoint, options.endpointParam || undefined)
            .query(query)
            .then(function(result) {
                return result;
            });
    };
}])
.provider('ItemList', function() {
    this.$get = ['itemListService', function(itemListService) {
        var ItemList = function() {
            this.listeners = [];
            this.options = {};
            this.result = {};
            this.maxPage = 1;
        };

        ItemList.prototype.setOptions = function(options) {
            this.options = _.extend(this.options, options);
            return this;
        };

        ItemList.prototype.addListener = function(listener) {
            this.listeners.push(listener);
            return this;
        };

        ItemList.prototype.removeListener = function(listener) {
            _.remove(this.listeners, function(i) {
                return i === listener;
            });
            return this;
        };

        ItemList.prototype.fetch = function() {
            var self = this;

            return itemListService.fetch(this.options)
            .then(function(result) {
                self.result = result;
                self.maxPage = Math.ceil(result._meta.total / self.options.pageSize);
                _.each(self.listeners, function(listener) {
                    listener(result);
                });
                return result;
            });
        };

        return ItemList;
    }];
})
.directive('sdItemList', ['ItemList', function(ItemList) {
    return {
        transclude: true,
        scope: {
            options: '='
        },
        link: function(scope, element, attrs, ctrl, $transclude) {
            scope.itemList = new ItemList();

            scope.items = null;

            scope.itemList.addListener(function(result) {
                scope.items = result;
            });

            scope.$watch('options', function() {
                $transclude(scope, function(clone) {
                    element.html(clone);
                });
                scope.itemList.setOptions(scope.options);
                scope.itemList.fetch();
            }, true);
        }
    };
}]);

})();
