/*
Copyright 2017 Vector Creations Ltd
Copyright 2018 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, {useState} from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {Resizable} from "re-resizable";

import AppTile from '../elements/AppTile';
import dis from '../../../dispatcher/dispatcher';
import * as sdk from '../../../index';
import * as ScalarMessaging from '../../../ScalarMessaging';
import WidgetUtils from '../../../utils/WidgetUtils';
import WidgetEchoStore from "../../../stores/WidgetEchoStore";
import {IntegrationManagers} from "../../../integrations/IntegrationManagers";
import SettingsStore from "../../../settings/SettingsStore";
import {useLocalStorageState} from "../../../hooks/useLocalStorageState";
import ResizeNotifier from "../../../utils/ResizeNotifier";
import WidgetStore from "../../../stores/WidgetStore";

export default class AppsDrawer extends React.Component {
    static propTypes = {
        userId: PropTypes.string.isRequired,
        room: PropTypes.object.isRequired,
        resizeNotifier: PropTypes.instanceOf(ResizeNotifier).isRequired,
        showApps: PropTypes.bool, // Should apps be rendered
        hide: PropTypes.bool, // If rendered, should apps drawer be visible
    };

    static defaultProps = {
        showApps: true,
        hide: false,
    };

    constructor(props) {
        super(props);

        this.state = {
            apps: this._getApps(),
        };
    }

    componentDidMount() {
        ScalarMessaging.startListening();
        WidgetStore.instance.on(this.props.room.roomId, this._updateApps);
        this.dispatcherRef = dis.register(this.onAction);
    }

    componentWillUnmount() {
        ScalarMessaging.stopListening();
        WidgetStore.instance.off(this.props.room.roomId, this._updateApps);
        if (this.dispatcherRef) dis.unregister(this.dispatcherRef);
    }

    // TODO: [REACT-WARNING] Replace with appropriate lifecycle event
    // eslint-disable-next-line camelcase
    UNSAFE_componentWillReceiveProps(newProps) {
        // Room has changed probably, update apps
        this._updateApps();
    }

    onAction = (action) => {
        const hideWidgetKey = this.props.room.roomId + '_hide_widget_drawer';
        switch (action.action) {
            case 'appsDrawer':
                // Note: these booleans are awkward because localstorage is fundamentally
                // string-based. We also do exact equality on the strings later on.
                if (action.show) {
                    localStorage.setItem(hideWidgetKey, "false");
                } else {
                    // Store hidden state of widget
                    // Don't show if previously hidden
                    localStorage.setItem(hideWidgetKey, "true");
                }

                break;
        }
    };

    _getApps = () => WidgetStore.instance.getApps(this.props.room, true);

    _updateApps = () => {
        this.setState({
            apps: this._getApps(),
        });
    };

    _launchManageIntegrations() {
        if (SettingsStore.getValue("feature_many_integration_managers")) {
            IntegrationManagers.sharedInstance().openAll();
        } else {
            IntegrationManagers.sharedInstance().getPrimaryManager().open(this.props.room, 'add_integ');
        }
    }

    setResizing = (resizing) => {
        this.setState({ resizing });
    };

    render() {
        if (!this.props.showApps) return <div />;

        const apps = this.state.apps.map((app, index, arr) => {
            const capWhitelist = WidgetUtils.getCapWhitelistForAppTypeInRoomId(app.type, this.props.room.roomId);

            return (<AppTile
                key={app.id}
                app={app}
                fullWidth={arr.length < 2}
                room={this.props.room}
                userId={this.props.userId}
                creatorUserId={app.creatorUserId}
                widgetPageTitle={WidgetUtils.getWidgetDataTitle(app)}
                waitForIframeLoad={app.waitForIframeLoad}
                whitelistCapabilities={capWhitelist}
            />);
        });

        if (apps.length === 0) {
            return <div />;
        }

        let spinner;
        if (
            apps.length === 0 && WidgetEchoStore.roomHasPendingWidgets(
                this.props.room.roomId,
                WidgetUtils.getRoomWidgets(this.props.room),
            )
        ) {
            const Loader = sdk.getComponent("elements.Spinner");
            spinner = <Loader />;
        }

        const classes = classNames({
            mx_AppsDrawer: true,
            mx_AppsDrawer_hidden: this.props.hide,
            mx_AppsDrawer_fullWidth: apps.length < 2,
            mx_AppsDrawer_minimised: !this.props.showApps,
            mx_AppsDrawer_resizing: this.state.resizing,
        });

        return (
            <div className={classes}>
                <PersistentVResizer
                    id={"apps-drawer_" + this.props.room.roomId}
                    minHeight={100}
                    maxHeight={this.props.maxHeight ? this.props.maxHeight - 50 : undefined}
                    handleClass="mx_AppsContainer_resizerHandle"
                    className="mx_AppsContainer"
                    resizeNotifier={this.props.resizeNotifier}
                    setResizing={this.setResizing}
                >
                    { apps }
                    { spinner }
                </PersistentVResizer>
            </div>
        );
    }
}

const PersistentVResizer = ({
    id,
    minHeight,
    maxHeight,
    className,
    handleWrapperClass,
    handleClass,
    resizeNotifier,
    setResizing,
    children,
}) => {
    const [height, setHeight] = useLocalStorageState("pvr_" + id, 280); // old fixed height was 273px

    return <Resizable
        size={{height: Math.min(height, maxHeight)}}
        minHeight={minHeight}
        maxHeight={maxHeight}
        onResizeStart={() => {
            setResizing(true);
            resizeNotifier.startResizing();
        }}
        onResize={() => {
            resizeNotifier.notifyTimelineHeightChanged();
        }}
        onResizeStop={(e, dir, ref, d) => {
            setHeight(height + d.height);
            setResizing(false);
            resizeNotifier.stopResizing();
        }}
        handleWrapperClass={handleWrapperClass}
        handleClasses={{bottom: handleClass}}
        className={className}
        enable={{bottom: true}}
    >
        { children }
    </Resizable>;
};
