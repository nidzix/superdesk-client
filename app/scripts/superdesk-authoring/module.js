define([
    'angular',
    'moment'
], function(angular, moment) {
    'use strict';

    LockService.$inject = ['$q', 'api', 'session'];
    function LockService($q, api, session) {

        /**
         * Lock an item
         */
        this.lock = function(item) {
            if (this.isLocked(item)) {
                return $q.reject();
            } else {
                return api('archive_lock', item).save({});
            }
        };

        /**
         * Unlock an item
         */
        this.unlock = function(item) {
            return api('archive_unlock', item).save({});
        };

        /**
         * Test if an item is locked
         */
        this.isLocked = function(item) {
            return item && item.lock_user && item.lock_user !== session.identity._id;
        };
    }

    ConfirmDirtyFactory.$inject = ['$window', '$q', 'modal', 'gettext'];
    function ConfirmDirtyFactory($window, $q, modal, gettext) {
        /**
         * Asks for user confirmation if there are some changes which are not saved.
         * - Detecting changes via $scope.dirty - it's up to the controller to set it.
         */
        return function ConfirmDirty($scope) {
            $window.onbeforeunload = function() {
                if ($scope.dirty) {
                    return gettext('There are unsaved changes. If you navigate away, your changes will be lost.');
                }
            };

            $scope.$on('$destroy', function() {
                $window.onbeforeunload = angular.noop;
            });

            this.confirm = function() {
                if ($scope.dirty) {
                    return confirmDirty();
                } else {
                    return $q.when();
                }
            };

            function confirmDirty() {
                return modal.confirm(gettext('There are unsaved changes. Please confirm you want to close the article without saving.'));
            }
        };
    }

    AuthoringController.$inject = [
        '$scope',
        '$routeParams',
        '$timeout',
        'superdesk',
        'api',
        'workqueue',
        'notify',
        'gettext',
        'ConfirmDirty',
        'lock'
    ];

    function AuthoringController($scope, $routeParams, $timeout, superdesk, api,
        workqueue, notify, gettext, ConfirmDirty, lock) {
        var _item,
            confirm = new ConfirmDirty($scope);

        $scope.item = null;
        $scope.dirty = null;
        $scope.workqueue = workqueue.all();
        $scope.editable = false;
        $scope.currentVersion = null;
        $scope.draft = null;
        $scope.draftselected = {flag: false};
        setupNewItem();
        $scope.saving = false;
        $scope.saved = false;

        function initialize() {
            lock.lock(_item)['finally'](function() {
                $scope.item = _.create(_item);
                $scope.editable = !lock.isLocked(_item);
                workqueue.setActive(_item);
            });
        }

        function setupNewItem() {
            if ($routeParams._id) {
                _item = workqueue.findItem($routeParams._id) || workqueue.active;
                api.archive_autosave.getByUrl(_item._links.self.href)
                .then(function(draft) {
                    console.log(draft);
                    $scope.draft = draft;
                    $scope.draftselected.flag = true;
                    _item = workqueue.consistence(_item, draft);
                    initialize();
                }, function() {
                    initialize();
                });
            }
        }

        function isEditable(item) {
            if ($scope.isLocked(item)) {
                return false;
            }

            if (!item._latest_version) {
                return true;
            }
            console.log('Version checking');
            console.log(item._version);
            console.log(item._latest_version);
            return item._latest_version === item._version;
        }

        function isDirty(item) {
            var dirty = false;
            angular.forEach(item, function(val, key) {
                dirty = dirty || val !== _item[key];
            });

            return dirty;
        }

        $scope.$watchCollection('item', function(item) {
            if (!item) {
                $scope.dirty = $scope.editable = false;
                return;
            }

            $scope.editable = isEditable(item);
            $scope.dirty = isDirty(item);

            if ($scope.dirty && $scope.editable && (!$scope.draft || ($scope.draft && $scope.draftselected.flag))) {
                autosave();
            }
        });

        $scope.isLocked = function(item) {
            return lock.isLocked(item);
        };

        $scope.articleSwitch = function() {
            $scope.update();
        };

        $scope.update = function() {
            if ($scope.dirty && $scope.editable) {
                workqueue.update($scope.item, true); //do local update with dirty flag
                $scope.saving = true;
                //prepare item for saving
                var item = _.pick($scope.item, '_id', 'guid', '_links', 'headline', 'body_html', 'slugline');
                api('archive_autosave', $scope.item).save(item).then(function(draft) {
                    $scope.draft = draft;
                    workqueue.update(draft, false); //validate dirty flag
                    $scope.saving = false;
                    $scope.saved = true;
                    $timeout(function() {
                        $scope.saved = false;
                    }, 2000);
                }, function(response) {
                    $scope.saving = false;
                });
            }
        };

        var autosave = _.debounce($scope.update, 3000);

        $scope.save = function() {
            delete $scope.item._version;
            return api.archive.save(_item, $scope.item).then(function(res) {
                //remove draft
                //set latest version as selected
                workqueue.update(_item, false);
                $scope.item = _.create(_item);
                $scope.dirty = false;
                notify.success(gettext('Item updated.'));
            }, function(response) {
                notify.error(gettext('Error. Item not updated.'));
            });
        };

        $scope.close = function() {
            confirm.confirm().then(function() {
                if ($scope.editable) {
                    lock.unlock($scope.item);
                }
                $scope.dirty = false;
                workqueue.remove($scope.item);
                superdesk.intent('author', 'dashboard');
            });
        };

        $scope.$on('$routeUpdate', setupNewItem);
    }

    WorkqueueService.$inject = ['storage'];
    function WorkqueueService(storage) {
        /**
         * Set items for further work, in next step of the workflow.
         */

        var queue = storage.getItem('workqueue:items') || [];
        this.length = 0;
        this.active = null;

        /**
         * Add an item into queue
         *
         * it checks if item is in queue already and if yes it will move it to the very end
         *
         * @param {Object} item
         */
        this.add = function(item) {
            var current = this.find(item._id);

            if (current) {
                this.consistence(current.item, item);
            } else {
                queue.unshift({
                    item: item,
                    dirty: false
                });
            }
            this.length = queue.length;
            this.active = item;
            this.save();
            return this;
        };

        /**
         * Update item in a queue, provide item, and cache flag
         */
        this.update = function(item, dirty) {
            if (item) {
                var base = this.find(item._id);
                var index = _.indexOf(queue, base);
                queue[index] = _.extend(base, {item: item, dirty: dirty});
                this.save();
                return queue[index];
            }
        };

        /**
         * If 'item' is newer than current one, override it
         */
        this.consistence = function(current, item) {
            if (moment(item._updated).isAfter(current._updated)) {
                return this.update(item, false);
            } else {
                return current;
            }
        };

        /**
         * Get first item
         */
        this.first = function() {
            return _.first(queue);
        };

        /**
         * Get all items from queue
         */
        this.all = function() {
            return _.map(queue, 'item');
        };

        /**
         * Save queue to local storage
         */
        this.save = function() {
            storage.setItem('workqueue:items', queue);
        };

        /**
         * Find item by given criteria
         */
        this.find = function(_id) {
            return _.find(queue, function(item) {
                return item.item._id === _id;
            });
        };

        this.findItem = function(_id) {
            var t = this.find(_id);
            return t.item;
        };

        /**
         * Set given item as active
         */
        this.setActive = function(item) {
            if (!item) {
                this.active = null;
            } else {
                this.active = this.find(item._id);
            }
        };

        /**
         * Remove given item from queue
         */
        this.remove = function(item) {
            _.remove(queue, this.find(item._id));
            this.length = queue.length;
            this.save();

            if (this.active.item._id === item._id && this.length > 0) {
                this.setActive(_.first(queue));
            } else {
                this.active = null;
            }
        };

    }

    WorkqueueCtrl.$inject = ['$scope', 'workqueue', 'superdesk', 'ContentCtrl'];
    function WorkqueueCtrl($scope, workqueue, superdesk, ContentCtrl) {
        $scope.workqueue = workqueue.all();
        $scope.content = new ContentCtrl();

        $scope.openItem = function(article) {
            if ($scope.active) {
                $scope.update();
            }
            workqueue.setActive(article);
            superdesk.intent('author', 'article', article);
        };

        $scope.openDashboard = function() {
            superdesk.intent('author', 'dashboard');
        };

        $scope.closeItem = function(item) {
            if ($scope.active) {
                $scope.close();
            } else {
                workqueue.remove(item);
                superdesk.intent('author', 'dashboard');
            }
        };
    }

    function WorkqueueListDirective() {
        return {
            templateUrl: 'scripts/superdesk-authoring/views/opened-articles.html',
            scope: {
                active: '=',
                update: '&',
                close: '&'
            },
            controller: WorkqueueCtrl
        };
    }

    return angular.module('superdesk.authoring', [
            'superdesk.editor',
            'superdesk.authoring.widgets',
            'superdesk.authoring.metadata',
            'superdesk.authoring.comments',
            'superdesk.authoring.versions'
        ])

        .service('lock', LockService)
        .service('workqueue', WorkqueueService)
        .factory('ConfirmDirty', ConfirmDirtyFactory)
        .directive('sdWorkqueue', WorkqueueListDirective)

        .config(['superdeskProvider', function(superdesk) {
            superdesk
                .activity('/authoring/:_id', {
                    label: gettext('Authoring'),
                    templateUrl: 'scripts/superdesk-authoring/views/main.html',
                    topTemplateUrl: 'scripts/superdesk-dashboard/views/workspace-topnav.html',
                    controller: AuthoringController,
                    beta: true,
                    filters: [{action: 'author', type: 'article'}]
                })
                .activity('/authoring/', {
                    label: gettext('Authoring'),
                    templateUrl: 'scripts/superdesk-authoring/views/dashboard.html',
                    topTemplateUrl: 'scripts/superdesk-dashboard/views/workspace-topnav.html',
                    beta: true,
                    controller: WorkqueueCtrl,
                    category: superdesk.MENU_MAIN,
                    filters: [{action: 'author', type: 'dashboard'}]
                })
                .activity('edit.text', {
                    label: gettext('Edit item'),
                    icon: 'pencil',
                    controller: ['data', '$location', 'workqueue', 'superdesk', function(data, $location, workqueue, superdesk) {
                        workqueue.add(data.item);
                        superdesk.intent('author', 'article', data.item);
                    }],
                    filters: [
                        {action: superdesk.ACTION_EDIT, type: 'archive'}
                    ]
                });
        }])
        .config(['apiProvider', function(apiProvider) {
            apiProvider.api('archive_autosave', {
                type: 'http',
                backend: {rel: 'archive_autosave'}
            });
        }]);
});
