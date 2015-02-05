(function() {
    'use strict';

    angular.module('superdesk.widgets.base', ['superdesk.itemList'])
        .factory('BaseWidgetController', ['$location', '$timeout', 'superdesk', 'search', 'preferencesService', 'notify', 'ItemList',
        function BaseWidgetControllerFactory($location, $timeout, superdesk, search, preferencesService, notify, ItemList) {

            var INGEST_EVENT = 'ingest:update';

            return function BaseWidgetController($scope) {
                $scope.query = null;
                $scope.items = null;
                $scope.pinnedItems = null;
                $scope.processedItems = null;
                $scope.selected = null;
                $scope.page = {current: 1, max: 1};
                $scope.similar = false;

                var ENTER = 13;
                var pinnedList = {};
                var itemList = new ItemList();

                $scope.searchOnEnter = function(query, $event) {
                    if ($event.keyCode === ENTER) {
                        $scope.query = query;
                        $event.stopPropagation();
                    }
                };

                $scope.pin = function(item) {
                    var newItem = _.cloneDeep(item);
                    newItem.pinnedInstance = true;
                    $scope.pinnedItems.push(newItem);
                    $scope.pinnedItems = _.uniq($scope.pinnedItems, '_id');
                    pinnedList[item._id] = true;
                    savePinned($scope.pinnedItems);
                };

                $scope.unpin = function(item) {
                    _.remove($scope.pinnedItems, {_id: item._id});
                    pinnedList[item._id] = false;
                    savePinned($scope.pinnedItems);
                };

                $scope.isPinned = function(item) {
                    return item && pinnedList[item._id];
                };

                $scope.toggleSimilar = function() {
                    $scope.similar = !$scope.similar;
                };

                $scope.view = function(item) {
                    $scope.selected = item;
                };

                $scope.go = function(item) {
                    $location.path('/workspace/content');
                    $location.search('_id', item._id);
                };

                var savePinned = function() {
                    preferencesService.update({
                        'pinned:items': $scope.pinnedItems
                    }, 'pinned:items')
                    .then(function() {
                        processItems();
                    }, function(response) {
                        notify.error(gettext('Session preference could not be saved...'));
                    });
                };

                var loadPinned = function() {
                    preferencesService.get('pinned:items')
                    .then(function(result) {
                        $scope.pinnedItems = result;
                        _.each($scope.pinnedItems, function(item) {
                            pinnedList[item._id] = true;
                        });
                    });
                };

                var processItems = function() {
                    $scope.processedItems = $scope.pinnedItems.concat($scope.items._items);
                };

                var _refresh = function() {
                    itemList
                    .setOptions($scope.itemListOptions)
                    .fetch();
                };
                var refresh = _.debounce(_refresh, 1000);

                $scope.$on(INGEST_EVENT, function() {
                    $timeout(refresh);
                });

                itemList.addListener(function(result) {
                    $scope.items = result;
                    $scope.page.max = itemList.maxPage;
                    processItems();
                });

                $scope.$watchGroup([
                    'widget.configuration.provider',
                    'widget.configuration.maxItems',
                    'widget.configuration.search',
                    'query',
                    'similar'
                ], function(vals) {
                    $scope.itemListOptions.provider = (!vals[0] || vals[0] !== 'all') ? vals[0] : undefined;
                    $scope.itemListOptions.pageSize = vals[1] ? vals[1] : 10;
                    $scope.itemListOptions.search = vals[3] || vals[2] || undefined;
                    if (vals[4]) {
                        $scope.itemListOptions.search = $scope.item.slugline;
                    }
                    if ($scope.page.current === 1) {
                        refresh();
                    } else {
                        $scope.page.current = 1;
                    }
                });

                $scope.$watch('page.current', function() {
                    $scope.itemListOptions.page = $scope.page.current;
                    refresh();
                });

                loadPinned();
            };
        }])
        .factory('BaseWidgetConfigController', [
        function BaseWidgetConfigControllerFactory() {

            return function BaseWidgetConfigController($scope) {
                $scope.fetchProviders = function() {
                    $scope.api.query({source: {size: 0}}).then(function(items) {
                        $scope.availableProviders = ['all'].concat(_.pluck(items._aggregations.source.buckets, 'key'));
                    });
                };

                $scope.notIn = function(haystack) {
                    return function(needle) {
                        return haystack.indexOf(needle) === -1;
                    };
                };
            };
        }]);
})();
