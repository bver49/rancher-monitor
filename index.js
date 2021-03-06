var axios = require('axios');
var CronJob = require('cron').CronJob;
var rancherHost = process.env.RANCHERHOST;
var key = process.env.KEY;
var secret = process.env.SECRET;
var token = 'Basic ' + new Buffer(`${key}:${secret}`).toString('base64');
var envId = process.env.ENVID;
var slackApi = process.env.SLACKAPI;
var sendResolve = (process.env.SENDRESOLVE) ? (process.env.SENDRESOLVE) : 0;
var log = (process.env.LOG) ? (process.env.LOG) : 0;
var checkTimes = (process.env.CHECKTIMES) ? (parseInt(process.env.CHECKTIMES)) : 3;
var apiVersion = (process.env.APIVERSION) ? (process.env.APIVERSION) : 'v2-beta';
var hostList = (process.env.HOSTLIST) ? (process.env.HOSTLIST) : '';
var hostArray = (hostList && hostList != '') ? hostList.split(',') : [];
var cpuLimit = (process.env.CPULIMIT) ? (parseInt(process.env.CPULIMIT)) : 90;
var memLimit = (process.env.MEMLIMIT) ? (parseInt(process.env.MEMLIMIT)) : 90;
var diskLimit = (process.env.DISKLIMIT) ? (parseInt(process.env.DISKLIMIT)) : 90;
var cronTime = (process.env.CRONTIME) ? (process.env.CRONTIME) : '1 * * * * *';
var notifyList = {};

var options = {
  rancherHost: rancherHost,
  key: key,
  secret: secret,
  envId: envId,
  slackApi: slackApi,
  hostArray: hostArray,
  cpuLimit: cpuLimit,
  memLimit: memLimit,
  diskLimit: diskLimit,
  cronTime: cronTime,
  log: log,
  sendResolve: sendResolve,
  checkTimes: checkTimes
}

var api = axios.create({
  baseURL: `${rancherHost}/${apiVersion}/projects/${envId}/hosts`,
  headers: {
    'cache-control': 'no-cache',
    'Authorization': token
  }
});

function getHostInfo() {
  return new Promise(function(resolve, reject) {
    api.get().then(function(res) {
      var hostsData = res.data.data;
      var result = [];
      for (var i in hostsData) {
        var hostid = hostsData[i].id;
        var hostname = hostsData[i].hostname;
        var mem = hostsData[i].info.memoryInfo;
        var disk = hostsData[i].info.diskInfo.mountPoints['/dev/sda1'];
        var cpu = hostsData[i].info.cpuInfo;
        var diskUsage = disk.percentage.toFixed(2);
        var memUsage = ((mem.active / mem.memTotal) * 100).toFixed(2);
        var cpuUsage = ((cpu.loadAvg[1]/cpu.count)*100).toFixed(2);
        var hostInfo = {
          hostid: hostid,
          hostname: hostname,
          cpuUsage: parseFloat(cpuUsage),
          memUsage: parseFloat(memUsage),
          diskUsage: parseFloat(diskUsage)
        }
        result.push(hostInfo);
      }
      resolve(result);
    }).catch(function(err) {
      reject(err);
    });
  });
}

function check() {
  getHostInfo().then(function(result) {
    for (var i in result) {
      var warnMsg = `Hey <!here>!\n Host \`${result[i].hostname}\` is under high load!\n`;
      var warning = 0;
      var msg = `Hey <!here>!\n Host \`${result[i].hostname}\` back to normal!\n`;
      msg += `The CPU loading in last 5 min is \`${result[i].cpuUsage}%\`!\n`;
      msg += `The max Memory usage in last 1 min is \`${result[i].memUsage}%\`!\n`;
      msg += `Disk usage is \`${result[i].diskUsage}%\`!`;
      if (result[i].cpuUsage > cpuLimit) {
        warnMsg += `The CPU loading in last 5 min is over \`${cpuLimit}%\`, value is \`${result[i].cpuUsage}%\`!\n`;
        warning = 1;
      }
      if (result[i].memUsage > memLimit) {
        warnMsg += `The max Memory usage in last 1 min is over \`${memLimit}%\`, value is \`${result[i].memUsage}%\`!\n`;
        warning = 1;
      }
      if (result[i].diskUsage > diskLimit) {
        warnMsg += `Disk usage over \`${diskLimit}%\`, now usage \`${result[i].diskUsage}%\`!`;
        warning = 1;
      }
      if (log) console.log(result[i]);
      if (warning) {
        notifyList[result[i].hostid] += 1;
        if ((notifyList[result[i].hostid] == checkTimes) && slackApi) {
          sendSlackMsg(warnMsg);
        }
      } else {
        if (notifyList[result[i].hostid] >= checkTimes && slackApi && sendResolve) {
          sendSlackMsg(msg);
        }
        notifyList[result[i].hostid] = 0;
      }
    }
  }).catch(function(err) {
    console.log(err);
  });
}

function sendSlackMsg(msg) {
  axios.post(slackApi, {
    'text': msg
  });
}

for (var i in hostArray) {
  notifyList[hostArray[i]] = 0;
}

console.log(options);

if (!key || !secret || !envId || !rancherHost) {
  console.log('缺少參數!');
} else {
  new CronJob({
    cronTime: cronTime,
    onTick: function() {
      console.log('check');
      check();
    },
    start: true,
    timeZone: 'Asia/Taipei'
  });
}
