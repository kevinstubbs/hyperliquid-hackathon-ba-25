import React from 'react';
import { Box, Text } from 'ink';
import { Message } from './types.js';

export type ChatViewProps = {
  messages: Message[];
  isTyping: boolean;
  canScrollUp: boolean;
  canScrollDown: boolean;
  actualScrollOffset: number;
  maxScroll: number;
};

export const ChatView = ({
  messages,
  isTyping,
  canScrollUp,
  canScrollDown,
  actualScrollOffset,
  maxScroll,
}: ChatViewProps) => {
  return (
    <>
      {messages.map(message => {
        const isEvaluation = message.type === 'evaluation';
        const isUser = message.type === 'user';
        const color = isEvaluation
          ? 'yellow'
          : isUser
            ? 'blue'
            : 'white';

        return (
          <Box key={message.id} marginBottom={1} flexDirection="column" width="100%">
            <Box>
              <Text color={color} bold={isEvaluation}>
                {isEvaluation ? '[EVAL]' : isUser ? '[YOU]' : '[AGENT]'}:{' '}
              </Text>
              <Text wrap="wrap">{message.content}</Text>
            </Box>
          </Box>
        );
      })}
      {isTyping && (
        <Box marginTop={1}>
          <Text color="gray">[AGENT] Agent is typing...</Text>
        </Box>
      )}
      {canScrollUp && (
        <Box marginTop={1}>
          <Text color="gray">[UP] Scroll up</Text>
        </Box>
      )}
      {canScrollDown && (
        <Box marginTop={1}>
          <Text color="gray">[DOWN] Scroll down</Text>
        </Box>
      )}
      {actualScrollOffset > 0 && (
        <Box marginTop={1}>
          <Text color="gray">Scroll: {actualScrollOffset}/{maxScroll}</Text>
        </Box>
      )}
    </>
  );
};

