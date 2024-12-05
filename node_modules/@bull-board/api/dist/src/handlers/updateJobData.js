"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateJobDataHandler = void 0;
const job_1 = require("../providers/job");
const queue_1 = require("../providers/queue");
async function updateJobData(req, job) {
    const { jobData } = req.body;
    if ('updateData' in job) {
        await job.updateData(jobData);
    }
    else if ('update' in job) {
        await job.update(jobData);
    }
    return {
        status: 200,
        body: {},
    };
}
exports.updateJobDataHandler = (0, queue_1.queueProvider)((0, job_1.jobProvider)(updateJobData));
//# sourceMappingURL=updateJobData.js.map