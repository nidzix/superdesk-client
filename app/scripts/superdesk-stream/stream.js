(function(){
	'use strict';

	var app = angular.module('superdesk.stream', [
        'superdesk.activity',
        'superdesk.asset'
    ]);


    app.controller('StreamController', ['$scope', 'api', '$rootScope', 'desks', function($scope, api, $rootScope, desks) {
        $scope.desk = null;
        $scope.activities = null;

        var fetchActivities = function() {
            var filter = {embedded: {user: 1}};
            if ($scope.desk) {
                filter.where = {desk: $scope.desk._id}
            }

            api('activity').query(filter)
            .then(function(result) {
                $scope.activities = [];
                result._items.forEach(function(activity, index, array) {
                    activity.display_message = activity.message;
                    for (var tag in activity.data) {
                        if (activity.data.hasOwnProperty(tag)) {
                            var tagRegex = new RegExp('{{\\s*'+tag+'\\s*}}', 'gi');
                            activity.display_message = activity.display_message.replace(tagRegex, activity.data[tag]);
                        }
                    };
                    $scope.activities.push(activity);
                });
                $scope.activities = result;
            });
        };

        $scope.$watch('desk', function() {
            fetchActivities();
        });

        $rootScope.$on('activity', function(_e, extras) {
            fetchActivities();
        });
    }])
    .config(['superdeskProvider', 'assetProvider', 'gettext', function(superdesk, asset, gettext) {
        superdesk.activity('/workspace/stream', {
            label: gettext('Workspace'),
            controller: 'StreamController',
            templateUrl: asset.templateUrl('superdesk-stream/views/workspace-stream.html'),
            topTemplateUrl: asset.templateUrl('superdesk-dashboard/views/workspace-topnav.html'),
            beta: true
        });
    }]);
})();
