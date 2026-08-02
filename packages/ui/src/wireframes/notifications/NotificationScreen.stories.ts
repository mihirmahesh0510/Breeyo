import React from 'react';
import { NotificationScreen } from './NotificationScreen';
import { mockNotifications, emptyNotifications, ERROR_MESSAGE } from './fixtures';

export default {
  title: 'Wireframes/Notifications/NotificationScreen',
  component: NotificationScreen,
};

export const Empty = () =>
  React.createElement(NotificationScreen, {
    state: 'empty',
    notifications: emptyNotifications,
    testID: 'notification-screen-empty',
  });

export const Loading = () =>
  React.createElement(NotificationScreen, {
    state: 'loading',
    testID: 'notification-screen-loading',
  });

export const Populated = () =>
  React.createElement(NotificationScreen, {
    state: 'populated',
    notifications: mockNotifications,
    activeFilter: 'all',
    onFilterChange: () => {},
    onNotificationPress: () => {},
    onMarkAllRead: () => {},
    testID: 'notification-screen-populated',
  });

export const Error = () =>
  React.createElement(NotificationScreen, {
    state: 'error',
    errorMessage: ERROR_MESSAGE,
    testID: 'notification-screen-error',
  });
