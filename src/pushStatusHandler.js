import { md5Hash, newObjectId } from './cryptoUtils';

const PUSH_STATUS_COLLECTION = '_PushStatus';

export function flatten(array) {
  return array.reduce((memo, element) => {
    if (Array.isArray(element)) {
      memo = memo.concat(flatten(element));
    } else {
      memo = memo.concat(element);
    }
    return memo;
  }, []);
}

export default function pushStatusHandler(config) {

  let initialPromise;
  let pushStatus;

  let database = config.database.Unsafe();

  let setInitial = function(body, where, options = {source: 'rest'}) {
    let now = new Date();
    let object = {
      objectId: newObjectId(),
      pushTime: now.toISOString(),
      _created_at: now,
      query: JSON.stringify(where),
      payload: body.data,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: "pending",
      numSent: 0,
      pushHash: md5Hash(JSON.stringify(body.data)),
      // lockdown!
      _wperm: [],
      _rperm: []
    }

    return database.create(PUSH_STATUS_COLLECTION, object).then(() => {
      pushStatus = {
        objectId: object.objectId
      };
      return Promise.resolve(pushStatus);
    });
  }

  let setRunning = function() {
    return database.update(PUSH_STATUS_COLLECTION,
      {status:"pending", objectId: pushStatus.objectId},
      {status: "running"});
  }

  let complete = function(results) {
    let update = {
      status: 'succeeded',
      numSent: 0,
      numFailed: 0,
    };
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result.device || !result.device.deviceType) {
          return memo;
        }
        let deviceType = result.device.deviceType;
        if (result.transmitted)
        {
          memo.numSent++;
          memo.sentPerType = memo.sentPerType || {};
          memo.sentPerType[deviceType] = memo.sentPerType[deviceType] || 0;
          memo.sentPerType[deviceType]++;
        } else {
          memo.numFailed++;
          memo.failedPerType = memo.failedPerType || {};
          memo.failedPerType[deviceType] = memo.failedPerType[deviceType] || 0;
          memo.failedPerType[deviceType]++;
        }
        return memo;
      }, update);
    }
    return database.update('_PushStatus', {status:"running", objectId: pushStatus.objectId}, update);
  }

  return Object.freeze({
    setInitial,
    setRunning,
    complete
  })
}
