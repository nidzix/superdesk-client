(function() {

'use strict';

TasksService.$inject = ['desks', '$rootScope', 'api'];
function TasksService(desks, $rootScope, api) {

    this.save = function(orig, task) {
        if (task.task.due_time) {
            task.task.due_date = new Date(
                task.task.due_date.getFullYear(),
                task.task.due_date.getMonth(),
                task.task.due_date.getDate(),
                task.task.due_time.getHours(),
                task.task.due_time.getMinutes(),
                task.task.due_time.getSeconds()
            );
        }
        delete task.task.due_time;
        if (!task.task.user) {
            delete task.task.user;
        }

        return api('tasks').save(orig, task)
        .then(function(result) {
            return result;
        });
    };

    this.fetch = function() {
        var filter = {term: {'task.user': $rootScope.currentUser._id}};
        if (desks.getCurrentDeskId()) {
            filter = {term: {'task.desk': desks.getCurrentDeskId()}};
        }
        return api('tasks').query({
            source: {
                size: 100,
                sort: [{_updated: 'desc'}],
                filter: filter
            }
        })
        .then(function(tasks) {
            return tasks;
        });
    };
}

TasksController.$inject = ['$scope', 'api', 'notify', 'desks', 'tasks'];
function TasksController($scope, api, notify, desks, tasks) {

    $scope.selected = {};
    $scope.newTask = null;

    desks.initialize()
    .then(function() {
        $scope.deskLookup = desks.deskLookup;
        $scope.userLookup = desks.userLookup;
    });

    $scope.tasks = {};

    $scope.$watch(function() {
        return desks.getCurrentDeskId();
    }, function() {
        fetchTasks();
    });

    var fetchTasks = function() {
        tasks.fetch().then(function(list) {
            $scope.tasks = list;
        });
    };

    $scope.preview = function(item) {
        $scope.selected.preview = item;
    };

    $scope.create = function() {
        $scope.newTask = {
            task: {
                desk: desks.getCurrentDeskId(),
                due_date: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
                due_time: new Date(null, null, null, 12, 0, 0)
            }
        };
    };

    $scope.save = function() {
        tasks.save({}, $scope.newTask)
        .then(function(result) {
            notify.success(gettext('Item saved.'));
            $scope.close();
            fetchTasks();
        });
    };

    $scope.close = function() {
        $scope.newTask = null;
    };

    fetchTasks();
}

TaskPreviewDirective.$inject = ['tasks', 'notify'];
function TaskPreviewDirective(tasks, notify) {
    return {
        templateUrl: 'scripts/superdesk-dashboard/workspace-tasks/views/task-preview.html',
        scope: {
            item: '=',
            users: '=',
            desks: '='
        },
        link: function(scope) {
            var _orig, _form;
            scope.task = null;
            scope.task_details = null;

            scope.setForm = function(form) {
                _form = form;
            };

            scope.$watch('item', function(newVal, oldVal) {
                if (newVal && ((oldVal && newVal._id !== oldVal._id) || !oldVal)) {
                    scope.reset();
                }
            });

            scope.$watch('task_details', function(newVal, oldVal) {
                if (newVal && oldVal) {
                    _form.taskForm.$setDirty();
                }
            }, true);

            scope.save = function(form) {
                _.extend(scope.task.task, scope.task_details);
                tasks.save(_orig, scope.task)
                .then(function(result) {
                    notify.success(gettext('Item saved.'));
                    _form.taskForm.$setPristine();
                });
            };

            scope.reset = function(form) {
                scope.task = null;
                scope.task_details = null;
                //
                //need scope.$apply() here
                //
                scope.task = _.create(scope.item);
                scope.task_details = _.extend({}, scope.item.task);
                _orig = scope.item;
                if (_form) {
                    _form.taskForm.$setPristine();
                }
            };
        }
    };
}

AssigneeViewDirective.$inject = ['desks'];
function AssigneeViewDirective(desks) {
    desks.initialize();
    return {
        templateUrl: 'scripts/superdesk-dashboard/workspace-tasks/views/assignee-view.html',
        scope: {item: '='},
        link: function(scope) {
            scope.deskLookup = desks.deskLookup;
            scope.userLookup = desks.userLookup;
        }
    };
}

angular.module('superdesk.workspace.tasks', [])

.directive('sdTaskPreview', TaskPreviewDirective)
.directive('sdAssigneeView', AssigneeViewDirective)
.service('tasks', TasksService)

.config(['superdeskProvider', function(superdesk) {

    superdesk.activity('/workspace/tasks', {
        label: gettext('Workspace'),
        controller: TasksController,
        templateUrl: 'scripts/superdesk-dashboard/workspace-tasks/views/workspace-tasks.html',
        topTemplateUrl: 'scripts/superdesk-dashboard/views/workspace-topnav.html',
        beta: true
    });
    superdesk.activity('pick.task', {
        label: gettext('Pick task'),
        icon: 'pick',
        controller: ['api', 'data', 'session', 'superdesk', 'workqueue',
            function(api, data, session, superdesk, workqueue) {
                api('tasks').save(
                    _.clone(data.item),
                    {task: _.extend({user: session.identity._id}, data.item.task)})
                .then(function(result) {
                    workqueue.add(result);
                    superdesk.intent('author', 'article', result);
                });
            }
        ],
        filters: [{action: superdesk.ACTION_EDIT, type: 'task'}]
    });
}]);

})();
