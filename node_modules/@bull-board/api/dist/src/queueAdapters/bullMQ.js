"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullMQAdapter = void 0;
const bullmq_1 = require("bullmq");
const statuses_1 = require("../constants/statuses");
const base_1 = require("./base");
class BullMQAdapter extends base_1.BaseAdapter {
    constructor(queue, options = {}) {
        var _a, _b;
        const libName = 'bullmq';
        super(libName, options);
        this.queue = queue;
        if (!(queue instanceof bullmq_1.Queue || ((_b = `${(_a = queue.metaValues) === null || _a === void 0 ? void 0 : _a.version}`) === null || _b === void 0 ? void 0 : _b.startsWith(libName)))) {
            throw new Error(`You've used the BullMQ adapter with a non-BullMQ queue.`);
        }
    }
    async getRedisInfo() {
        const client = await this.queue.client;
        return client.info();
    }
    getName() {
        return `${this.prefix}${this.queue.name}`;
    }
    async clean(jobStatus, graceTimeMs) {
        await this.queue.clean(graceTimeMs, Number.MAX_SAFE_INTEGER, jobStatus);
    }
    addJob(name, data, options) {
        return this.queue.add(name, data, options);
    }
    getJob(id) {
        return this.queue.getJob(id);
    }
    getJobs(jobStatuses, start, end) {
        return this.queue.getJobs(jobStatuses, start, end);
    }
    getJobCounts() {
        return this.queue.getJobCounts();
    }
    getJobLogs(id) {
        return this.queue.getJobLogs(id).then(({ logs }) => logs);
    }
    isPaused() {
        return this.queue.isPaused();
    }
    pause() {
        return this.queue.pause();
    }
    resume() {
        return this.queue.resume();
    }
    empty() {
        return this.queue.drain();
    }
    async promoteAll() {
        // since bullmq 4.6.0
        if (typeof this.queue.promoteJobs === 'function') {
            await this.queue.promoteJobs();
        }
        else {
            const jobs = await this.getJobs([statuses_1.STATUSES.delayed]);
            await Promise.all(jobs.map((job) => job.promote()));
        }
    }
    getStatuses() {
        return [
            statuses_1.STATUSES.latest,
            statuses_1.STATUSES.active,
            statuses_1.STATUSES.waiting,
            statuses_1.STATUSES.waitingChildren,
            statuses_1.STATUSES.prioritized,
            statuses_1.STATUSES.completed,
            statuses_1.STATUSES.failed,
            statuses_1.STATUSES.delayed,
            statuses_1.STATUSES.paused,
        ];
    }
    getJobStatuses() {
        return [
            statuses_1.STATUSES.active,
            statuses_1.STATUSES.waiting,
            statuses_1.STATUSES.waitingChildren,
            statuses_1.STATUSES.prioritized,
            statuses_1.STATUSES.completed,
            statuses_1.STATUSES.failed,
            statuses_1.STATUSES.delayed,
            statuses_1.STATUSES.paused,
        ];
    }
}
exports.BullMQAdapter = BullMQAdapter;
//# sourceMappingURL=bullMQ.js.map