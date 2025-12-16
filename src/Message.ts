export type MessageHandler = (...args: any) => void;

export interface MessageHandlerOptions {
    once?: boolean;
}