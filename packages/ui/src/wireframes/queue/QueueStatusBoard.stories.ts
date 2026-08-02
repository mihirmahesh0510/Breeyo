import React from 'react';
import { QueueStatusBoard } from './QueueStatusBoard';
import { MOCK_QUEUE_ENTRIES, EMPTY_QUEUE, ERROR_MESSAGE } from './fixtures';

export default {
  title: 'Wireframes/Queue/StatusBoard',
  component: QueueStatusBoard,
};

export const Empty = () =>
  React.createElement(QueueStatusBoard, {
    state: 'empty',
    entries: EMPTY_QUEUE,
    testID: 'queue-board-empty',
  });

export const Loading = () =>
  React.createElement(QueueStatusBoard, {
    state: 'loading',
    testID: 'queue-board-loading',
  });

export const Populated = () =>
  React.createElement(QueueStatusBoard, {
    state: 'populated',
    entries: MOCK_QUEUE_ENTRIES,
    onCheckIn: () => {},
    onEntryPress: () => {},
    testID: 'queue-board-populated',
  });

export const Error = () =>
  React.createElement(QueueStatusBoard, {
    state: 'error',
    errorMessage: ERROR_MESSAGE,
    testID: 'queue-board-error',
  });
