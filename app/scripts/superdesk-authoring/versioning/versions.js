
(function() {

'use strict';

    VersioningController.$inject = ['$scope', 'api', '$location', 'notify', 'workqueue', 'lock'];
    function VersioningController($scope, api, $location, notify, workqueue, lock) {

        $scope.versions = null;
        $scope.selected = null;
        $scope.users = {};

        var fetchUser = function(id) {
            api.users.getById(id)
            .then(function(result) {
                $scope.users[id] = result;
            });
        };

        var fetchVersions = function() {

            $scope.locked = $scope.item && lock.isLocked($scope.item);

            return api.archive.getByUrl($scope.item._links.self.href + '?version=all&embedded={"user":1}')
            .then(function(result) {
                _.each(result._items, function(version) {
                    var creator = version.creator || version.original_creator;
                    if (creator && !$scope.users[creator]) {
                        fetchUser(creator);
                    }
                });
                $scope.versions = result;
                if (!$scope.draftselected.flag) {
                    $scope.selected = _.find($scope.versions._items, {_version: $scope.item._version});
                }
            });
        };

        var filldata = function(data) {
            $scope.item._version = data._version;
            $scope.item.headline = data.headline;
            $scope.item.body_html = data.body_html;
        };

        $scope.openVersion = function(version) {
            $scope.draftselected.flag = false;
            $scope.selected = version;
            filldata(version);
        };

        $scope.openDraft = function() {
            $scope.draftselected.flag = true;
            $scope.selected = null;
            filldata($scope.draft);
        };

        $scope.revert = function() {
            $scope.save();
        };

        $scope.$watch('item', fetchVersions);
    }

angular.module('superdesk.authoring.versions', ['superdesk.authoring.versions'])
    .config(['authoringWidgetsProvider', function(authoringWidgetsProvider) {
        authoringWidgetsProvider
            .widget('versions', {
                icon: 'revision',
                label: gettext('Versions'),
                template: 'scripts/superdesk-authoring/versioning/views/versions.html'
            });
    }])

    .controller('VersioningWidgetCtrl', VersioningController);

})();
