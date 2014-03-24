define(['angular', 'lodash'], function(angular, _) {
    'use strict';

    var module = angular.module('superdesk.services');

    /**
     * Superdesk service for enabling/disabling beta preview in app
     */
    module.service('betaService', ['$window', '$rootScope', 'storage',
        function($window, $rootScope, storage) {

        $rootScope.beta = localStorage.getItem('beta') === 'true';

        this.toggleBeta = function() {
            localStorage.setItem('beta', !$rootScope.beta);
            $window.location.reload();
        };

        this.isBeta = function() {
			return $rootScope.beta;
        };

    }]);

	/**
	* Directive for displaying/hiding beta version elements
	*/
	module.directive('sdBeta', [ 'betaService', function(betaService) {
		return !betaService.isBeta() ? {
			priority: 10000,
			link: function(scope, elem, attrs) {
				if (!betaService.isBeta()) {
					elem.html('').addClass('beta-hide');
				}
			}
		} : {};
	}]);
});
