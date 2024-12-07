import { BoardOptions, IServerAdapter } from '../typings/app';
import { BaseAdapter } from './queueAdapters/base';
export declare function createBullBoard({ queues, serverAdapter, options, }: {
    queues: ReadonlyArray<BaseAdapter>;
    serverAdapter: IServerAdapter;
    options?: BoardOptions;
}): {
    setQueues: (newBullQueues: ReadonlyArray<BaseAdapter>) => void;
    replaceQueues: (newBullQueues: ReadonlyArray<BaseAdapter>) => void;
    addQueue: (queue: BaseAdapter) => void;
    removeQueue: (queueOrName: string | BaseAdapter) => void;
};
