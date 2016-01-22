window.RoomSelection = (function () {
    'use strict';

    function RoomSelection(roomSelectionDiv,
                           uiConstants, recentRoomsKey, setupCompletedCallback) {
        this.roomSelectionDiv_ = roomSelectionDiv;

        this.setupCompletedCallback_ = setupCompletedCallback;

        this.roomIdInput_ = this.roomSelectionDiv_.querySelector(
            uiConstants.roomSelectionInput);
        this.roomIdInputLabel_ = this.roomSelectionDiv_.querySelector(
            uiConstants.roomSelectionInputLabel);
        this.roomJoinButton_ = this.roomSelectionDiv_.querySelector(
            uiConstants.roomSelectionJoinButton);
        this.roomRandomButton_ = this.roomSelectionDiv_.querySelector(
            uiConstants.roomSelectionRandomButton);
        this.roomRecentList_ = this.roomSelectionDiv_.querySelector(
            uiConstants.roomSelectionRecentList);

        this.roomIdInput_.value = parseInt(Math.random() * 1e10);
        // Call onRoomIdInput_ now to validate initial state of input box.
        this.onRoomIdInput_();
        this.roomIdInput_.addEventListener('input',
            this.onRoomIdInput_.bind(this),
            false);
        this.roomIdInput_.addEventListener('keyup',
            this.onRoomIdKeyPress_.bind(this), false);
        this.roomRandomButton_.addEventListener('click',
            this.onRandomButton_.bind(this), false);
        this.roomJoinButton_.addEventListener('click',
            this.onJoinButton_.bind(this), false);

        this.recentlyUsedList_ = new RoomSelection.RecentlyUsedList(recentRoomsKey);
        this.startBuildingRecentRoomList_();

        // Public callbacks. Keep it sorted.
    };
    EventEmitter.bindPrototype(RoomSelection);

    RoomSelection.matchRandomRoomPattern = function (input) {
        return input.match(/^\d{9}$/) !== null;
    };

    RoomSelection.prototype.startBuildingRecentRoomList_ = function () {
        this.recentlyUsedList_.getRecentRooms().then(function (recentRooms) {
            this.buildRecentRoomList_(recentRooms);
            if (this.setupCompletedCallback_) {
                this.setupCompletedCallback_();
            }
        }.bind(this)).catch(function (error) {
            trace('Error building recent rooms list: ' + error.message);
        }.bind(this));
    };

    RoomSelection.prototype.buildRecentRoomList_ = function (recentRooms) {
        var lastChild = this.roomRecentList_.lastChild;
        while (lastChild) {
            this.roomRecentList_.removeChild(lastChild);
            lastChild = this.roomRecentList_.lastChild;
        }

        for (var i = 0; i < recentRooms.length; ++i) {
            // Create link in recent list
            var li = document.createElement('li');
            var href = document.createElement('a');
            var linkText = document.createTextNode(recentRooms[i]);
            href.appendChild(linkText);
            href.href = location.origin + '/r/' + encodeURIComponent(recentRooms[i]);
            li.appendChild(href);
            this.roomRecentList_.appendChild(li);

            // Set up click handler to avoid browser navigation.
            href.addEventListener('click',
                this.makeRecentlyUsedClickHandler_(recentRooms[i]), false);
        }
    };

    RoomSelection.prototype.onRoomIdInput_ = function () {
        // Validate room id, enable/disable join button.
        // The server currently accepts only the \w character class.
        var room = this.roomIdInput_.value;
        var valid = room.length >= 1;
        var re = /^\w+$/;
        valid = valid && re.exec(room);
        if (valid) {
            this.roomJoinButton_.disabled = false;
            this.roomIdInput_.classList.remove('invalid');
            this.roomIdInputLabel_.classList.add('hidden');
        } else {
            this.roomJoinButton_.disabled = true;
            this.roomIdInput_.classList.add('invalid');
            this.roomIdInputLabel_.classList.remove('hidden');
        }
    };

    RoomSelection.prototype.onRoomIdKeyPress_ = function (event) {
        if (event.which !== 13 || this.roomJoinButton_.disabled) {
            return;
        }
        this.onJoinButton_();
    };

    RoomSelection.prototype.onRandomButton_ = function () {
        this.roomIdInput_.value = parseInt(Math.random() * 1e10);
        this.onRoomIdInput_();
    };

    RoomSelection.prototype.onJoinButton_ = function () {
        this.loadRoom_(this.roomIdInput_.value);
    };

    RoomSelection.prototype.makeRecentlyUsedClickHandler_ = function (roomName) {
        return function (e) {
            e.preventDefault();
            this.loadRoom_(roomName);
        }.bind(this);
    };

    RoomSelection.prototype.loadRoom_ = function (roomName) {
        this.recentlyUsedList_.pushRecentRoom(parseInt(roomName));
        /*if (this.onRoomSelected) {
         this.onRoomSelected(roomName);
         }*/
        this.emit('RoomSelected', roomName);
    };

    RoomSelection.RecentlyUsedList = function (key) {
        // This is the length of the most recently used list.
        this.LISTLENGTH_ = 10;

        this.RECENTROOMSKEY_ = key || 'recentRooms';
    };

// Add a room to the recently used list and store to local storage.
    RoomSelection.RecentlyUsedList.prototype.pushRecentRoom = function (roomId) {
        // Push recent room to top of recent list, keep max of this.LISTLENGTH_ entries.
        return new Promise(function (resolve, reject) {
            if (!roomId) {
                resolve();
                return;
            }

            this.getRecentRooms().then(function (recentRooms) {
                recentRooms = [+roomId].concat(recentRooms);
                // Remove any duplicates from the list, leaving the first occurance.
                recentRooms = recentRooms.filter(function (value, index, self) {
                    return self.indexOf(value) === index;
                });
                recentRooms = recentRooms.slice(0, this.LISTLENGTH_);
                localStorage.setItem(this.RECENTROOMSKEY_,
                    JSON.stringify(recentRooms));
                resolve();
            }.bind(this)).catch(function (err) {
                reject(err);
            }.bind(this));
        }.bind(this));
    };

// Get the list of recently used rooms from local storage.
    RoomSelection.RecentlyUsedList.prototype.getRecentRooms = function () {
        return new Promise(function (resolve) {
            var value = localStorage.getItem(this.RECENTROOMSKEY_);
            var recentRooms;
            try {
                recentRooms = JSON.parse(value);
                if (!(recentRooms instanceof Array)) {
                    recentRooms = [];
                }
            } catch (ex) {
                recentRooms = [];
            }
            resolve(recentRooms);
        }.bind(this));
    };

    return RoomSelection;
})();