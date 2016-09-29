/*!
 * packets.js - packets for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2016, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var bcoin = require('../env');
var constants = require('../protocol/constants');
var utils = require('../utils/utils');
var crypto = require('../crypto/crypto');
var bn = require('bn.js');
var NetworkAddress = require('../primitives/netaddress');
var assert = utils.assert;
var DUMMY = new Buffer(0);

/**
 * Packet types.
 * @enum {Number}
 * @default
 */

exports.types = {
  VERSION: 0,
  VERACK: 1,
  PING: 1,
  PONG: 2,
  ALERT: 3,
  GETADDR: 4,
  ADDR: 5,
  INV: 6,
  GETDATA: 7,
  NOTFOUND: 8,
  GETBLOCKS: 9,
  GETHEADERS: 10,
  HEADERS: 11,
  SENDHEADERS: 12,
  BLOCK: 13,
  TX: 14,
  REJECT: 15,
  MEMPOOL: 16,
  FILTERLOAD: 17,
  FILTERADD: 18,
  FILTERCLEAR: 19,
  MERKLEBLOCK: 20,
  GETUTXOS: 21,
  UTXOS: 22,
  HAVEWITNESS: 23,
  FEEFILTER: 24,
  SENDCMPCT: 25,
  CMPCTBLOCK: 26,
  GETBLOCKTXN: 27,
  BLOCKTXN: 28,
  ENCINIT: 29,
  ENCACK: 30,
  AUTHCHALLENGE: 31,
  AUTHREPLY: 32,
  AUTHPROPOSE: 33,
  UNKNOWN: 34
};

/**
 * Base Packet
 * @constructor
 */

function Packet() {}

Packet.prototype.type = -1;
Packet.prototype.cmd = '';

/**
 * Version Packet
 * @constructor
 * @exports VersionPacket
 * @param {Object?} options
 * @param {Number} options.version - Protocol version.
 * @param {Number} options.services - Service bits.
 * @param {Number} options.ts - Timestamp of discovery.
 * @param {NetworkAddress} options.local - Our address.
 * @param {NetworkAddress} options.remote - Their address.
 * @param {BN} options.nonce
 * @param {String} options.agent - User agent string.
 * @param {Number} options.height - Chain height.
 * @param {Boolean} options.relay - Whether transactions
 * should be relayed immediately.
 * @property {Number} version - Protocol version.
 * @property {Number} services - Service bits.
 * @property {Number} ts - Timestamp of discovery.
 * @property {NetworkAddress} local - Our address.
 * @property {NetworkAddress} remote - Their address.
 * @property {BN} nonce
 * @property {String} agent - User agent string.
 * @property {Number} height - Chain height.
 * @property {Boolean} relay - Whether transactions
 * should be relayed immediately.
 */

function VersionPacket(options) {
  if (!(this instanceof VersionPacket))
    return new VersionPacket(options);

  Packet.call(this);

  this.version = constants.VERSION;
  this.services = constants.LOCAL_SERVICES;
  this.ts = bcoin.now();
  this.recv = new NetworkAddress();
  this.from = new NetworkAddress();
  this.nonce = new bn(0);
  this.agent = constants.USER_AGENT;
  this.height = 0;
  this.relay = true;

  if (options)
    this.fromOptions(options);
}

utils.inherits(VersionPacket, Packet);

VersionPacket.prototype.cmd = 'version';
VersionPacket.prototype.type = exports.types.VERSION;

/**
 * Inject properties from options.
 * @private
 * @param {Object} options
 */

VersionPacket.prototype.fromOptions = function fromOptions(options) {
  if (options.version != null)
    this.version = options.version;

  if (options.services != null)
    this.services = options.services;

  if (options.ts != null)
    this.ts = options.ts;

  if (options.recv)
    this.recv.fromOptions(options.recv);

  if (options.from)
    this.from.fromOptions(options.from);

  if (options.nonce)
    this.nonce = options.nonce;

  if (options.agent)
    this.agent = options.agent;

  if (options.height != null)
    this.height = options.height;

  if (options.relay != null)
    this.relay = options.relay;

  return this;
};

/**
 * Instantiate version packet from options.
 * @param {Object} options
 * @returns {VersionPacket}
 */

VersionPacket.fromOptions = function fromOptions(options) {
  return new VersionPacket().fromOptions(options);
};

/**
 * Serialize version packet.
 * @returns {Buffer}
 */

VersionPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.write32(this.version);
  p.writeU64(this.services);
  p.write64(this.ts);
  this.recv.toRaw(false, p);
  this.from.toRaw(false, p);
  p.writeU64(this.nonce);
  p.writeVarString(this.agent, 'ascii');
  p.write32(this.height);
  p.writeU8(this.relay ? 1 : 0);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Test whether the NETWORK service bit is set.
 * @returns {Boolean}
 */

VersionPacket.prototype.hasNetwork = function hasNetwork() {
  return (this.services & constants.services.NETWORK) !== 0;
};

/**
 * Test whether the BLOOM service bit is set.
 * @returns {Boolean}
 */

VersionPacket.prototype.hasBloom = function hasBloom() {
  return this.version >= 70011
    && (this.services & constants.services.BLOOM) !== 0;
};

/**
 * Test whether the GETUTXO service bit is set.
 * @returns {Boolean}
 */

VersionPacket.prototype.hasUTXO = function hasUTXO() {
  return (this.services & constants.services.GETUTXO) !== 0;
};

/**
 * Test whether the WITNESS service bit is set.
 * @returns {Boolean}
 */

VersionPacket.prototype.hasWitness = function hasWitness() {
  return (this.services & constants.services.WITNESS) !== 0;
};

/**
 * Test whether the protocol version supports getheaders.
 * @returns {Boolean}
 */

VersionPacket.prototype.hasHeaders = function hasHeaders() {
  return this.version >= 31800;
};

/**
 * Test whether the protocol version supports bip152.
 * @returns {Boolean}
 */

VersionPacket.prototype.hasCompact = function hasCompact() {
  return this.version >= 70014;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

VersionPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);

  this.version = p.read32();
  this.services = p.readU53();
  this.ts = p.read53();
  this.recv.fromRaw(p, false);

  if (p.left() > 0) {
    this.from.fromRaw(p, false);
    this.nonce = p.readU64();
  }

  if (p.left() > 0)
    this.agent = p.readVarString('ascii', 256);

  if (p.left() > 0)
    this.height = p.read32();

  if (p.left() > 0)
    this.relay = p.readU8() === 1;

  if (this.version === 10300)
    this.version = 300;

  assert(this.version >= 0, 'Version is negative.');
  assert(this.ts >= 0, 'Timestamp is negative.');
  // assert(this.height >= 0, 'Height is negative.');

  return this;
};

/**
 * Instantiate version packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {VersionPacket}
 */

VersionPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new VersionPacket().fromRaw(data, enc);
};

/**
 * Represents a `verack` packet.
 * @exports VerackPacket
 * @constructor
 */

function VerackPacket() {
  if (!(this instanceof VerackPacket))
    return new VerackPacket();

  Packet.call(this);
}

VerackPacket.prototype.cmd = 'verack';
VerackPacket.prototype.type = exports.types.VERACK;

/**
 * Serialize verack packet.
 * @returns {Buffer}
 */

VerackPacket.prototype.toRaw = function toRaw(writer) {
  return writer || DUMMY;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

VerackPacket.prototype.fromRaw = function fromRaw(data) {
  return this;
};

/**
 * Instantiate verack packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {VerackPacket}
 */

VerackPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new VerackPacket().fromRaw(data);
};

/**
 * Represents a `ping` packet.
 * @exports PingPacket
 * @constructor
 * @param {BN?} nonce
 * @property {BN|null} nonce
 */

function PingPacket(nonce) {
  if (!(this instanceof PingPacket))
    return new PingPacket(nonce);

  Packet.call(this);

  this.nonce = nonce || null;
}

utils.inherits(PingPacket, Packet);

PingPacket.prototype.cmd = 'ping';
PingPacket.prototype.type = exports.types.PING;

/**
 * Serialize ping packet.
 * @returns {Buffer}
 */

PingPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  if (this.nonce)
    p.writeU64(this.nonce);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

PingPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  if (p.left() >= 8)
    this.nonce = p.readU64();
  return this;
};

/**
 * Instantiate ping packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {PingPacket}
 */

PingPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new PingPacket().fromRaw(data);
};

/**
 * Represents a `pong` packet.
 * @exports PongPacket
 * @constructor
 * @param {BN?} nonce
 * @property {BN} nonce
 */

function PongPacket(nonce) {
  if (!(this instanceof PongPacket))
    return new PongPacket(nonce);

  Packet.call(this);

  this.nonce = nonce || new bn(0);
}

utils.inherits(PongPacket, Packet);

PongPacket.prototype.cmd = 'pong';
PongPacket.prototype.type = exports.types.PONG;

/**
 * Serialize pong packet.
 * @returns {Buffer}
 */

PongPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeU64(this.nonce);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

PongPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.nonce = p.readU64();
  return this;
};

/**
 * Instantiate pong packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {VerackPacket}
 */

PongPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new PongPacket().fromRaw(data);
};

/**
 * Alert Packet
 * @exports AlertPacket
 * @constructor
 * @param {Object} options
 * @property {Number} version
 * @property {Number} relayUntil
 * @property {Number} expiration
 * @property {Number} id
 * @property {Number} cancel
 * @property {Number[]} cancels
 * @property {Number} minVer
 * @property {Number} maxVer
 * @property {String[]} subVers
 * @property {Number} priority
 * @property {String} comment
 * @property {String} statusBar
 * @property {String?} reserved
 * @property {Buffer?} signature - Payload signature.
 */

function AlertPacket(options) {
  var time;

  if (!(this instanceof AlertPacket))
    return new AlertPacket(options);

  Packet.call(this);

  time = bcoin.now() + 7 * 86400;

  this.version = 1;
  this.relayUntil = time;
  this.expiration = time;
  this.id = 1;
  this.cancel = 0;
  this.cancels = [];
  this.minVer = 10000;
  this.maxVer = constants.VERSION;
  this.subVers = [];
  this.priority = 100;
  this.comment = '';
  this.statusBar = '';
  this.reserved = '';
  this.signature = null;

  this._payload = null;
  this._hash = null;

  if (options)
    this.fromOptions(options);
}

utils.inherits(AlertPacket, Packet);

AlertPacket.prototype.cmd = 'alert';
AlertPacket.prototype.type = exports.types.ALERT;

/**
 * Inject properties from options object.
 * @private
 * @param {Object} options
 */

AlertPacket.prototype.fromOptions = function fromOptions(options) {
  if (options.version != null)
    this.version = options.version;

  if (options.relayUntil != null)
    this.relayUntil = options.relayUntil;

  if (options.expiration != null)
    this.expiration = options.expiration;

  if (options.id != null)
    this.id = options.id;

  if (options.cancel != null)
    this.cancel = options.cancel;

  if (options.cancels)
    this.cancels = options.cancels;

  if (options.minVer != null)
    this.minVer = options.minVer;

  if (options.maxVer != null)
    this.maxVer = options.maxVer;

  if (options.subVers)
    this.subVers = options.subVers;

  if (options.priority != null)
    this.priority = options.priority;

  if (options.comment != null)
    this.comment = options.comment;

  if (options.statusBar != null)
    this.statusBar = options.statusBar;

  if (options.reserved != null)
    this.reserved = options.reserved;

  this.signature = options.signature;

  return this;
};

/**
 * Instantiate alert packet from options.
 * @param {Object} options
 * @returns {AlertPacket}
 */

AlertPacket.fromOptions = function fromOptions(options) {
  return new AlertPacket().fromOptions(options);
};

/**
 * Get the hash256 of the alert payload.
 * @param {String?} enc
 * @returns {Hash}
 */

AlertPacket.prototype.hash = function hash(enc) {
  if (!this._hash)
    this._hash = crypto.hash256(this.toPayload());
  return enc === 'hex' ? this._hash.toString('hex') : this._hash;
};

/**
 * Serialize the packet to its payload.
 * @returns {Buffer}
 */

AlertPacket.prototype.toPayload = function toPayload() {
  if (!this._payload)
    this._payload = this.framePayload();

  return this._payload;
};

/**
 * Sign the alert packet payload.
 * @param {Buffer} key - Private key.
 */

AlertPacket.prototype.sign = function sign(key) {
  this.signature = bcoin.ec.sign(this.hash(), key);
};

/**
 * Verify the alert packet.
 * @param {Buffer} key - Public key.
 * @returns {Boolean}
 */

AlertPacket.prototype.verify = function verify(key) {
  return bcoin.ec.verify(this.hash(), this.signature, key);
};

/**
 * Serialize the alert packet (includes payload _and_ signature).
 * @returns {Buffer}
 */

AlertPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeVarBytes(this.toPayload());
  p.writeVarBytes(this.signature);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Serialize the alert packet payload.
 * @private
 * @returns {Buffer}
 */

AlertPacket.prototype.framePayload = function framePayload(writer) {
  var p = bcoin.writer(writer);
  var i;

  p.write32(this.version);
  p.write64(this.relayUntil);
  p.write64(this.expiration);
  p.write32(this.id);
  p.write32(this.cancel);

  p.writeVarint(this.cancels.length);
  for (i = 0; i < this.cancels.length; i++)
    p.write32(this.cancels[i]);

  p.write32(this.minVer);
  p.write32(this.maxVer);

  p.writeVarint(this.subVers.length);
  for (i = 0; i < this.subVers.length; i++)
    p.writeVarString(this.subVers[i], 'ascii');

  p.write32(this.priority);
  p.writeVarString(this.comment, 'ascii');
  p.writeVarString(this.statusBar, 'ascii');
  p.writeVarString(this.reserved, 'ascii');

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

AlertPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, count;

  this._payload = p.readVarBytes();
  this.signature = p.readVarBytes();

  p = bcoin.reader(this._payload);

  this.version = p.read32();
  this.relayUntil = p.read53();
  this.expiration = p.read53();
  this.id = p.read32();
  this.cancel = p.read32();

  count = p.readVarint();
  for (i = 0; i < count; i++)
    this.cancels.push(p.read32());

  this.minVer = p.read32();
  this.maxVer = p.read32();

  count = p.readVarint();
  for (i = 0; i < count; i++)
    this.subVers.push(p.readVarString('ascii'));

  this.priority = p.read32();
  this.comment = p.readVarString('ascii');
  this.statusBar = p.readVarString('ascii');
  this.reserved = p.readVarString('ascii');

  return this;
};

/**
 * Instantiate alert packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {AlertPacket}
 */

AlertPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new AlertPacket().fromRaw(data, enc);
};

/**
 * Represents a `getaddr` packet.
 * @exports GetAddrPacket
 * @constructor
 */

function GetAddrPacket() {
  if (!(this instanceof GetAddrPacket))
    return new GetAddrPacket();

  Packet.call(this);
}

utils.inherits(GetAddrPacket, Packet);

GetAddrPacket.prototype.cmd = 'getaddr';
GetAddrPacket.prototype.type = exports.types.GETADDR;

/**
 * Serialize getaddr packet.
 * @returns {Buffer}
 */

GetAddrPacket.prototype.toRaw = function toRaw(writer) {
  return writer || DUMMY;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

GetAddrPacket.prototype.fromRaw = function fromRaw(data) {
  return this;
};

/**
 * Instantiate getaddr packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetAddrPacket}
 */

GetAddrPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new GetAddrPacket().fromRaw(data);
};

/**
 * Represents a `addr` packet.
 * @exports AddrPacket
 * @constructor
 * @param {(NetworkAddress[])?} items
 * @property {NetworkAddress[]} items
 */

function AddrPacket(items) {
  if (!(this instanceof AddrPacket))
    return new AddrPacket(items);

  Packet.call(this);

  this.items = items || [];
}

utils.inherits(AddrPacket, Packet);

AddrPacket.prototype.cmd = 'addr';
AddrPacket.prototype.type = exports.types.ADDR;

/**
 * Serialize addr packet.
 * @returns {Buffer}
 */

AddrPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);
  var i;

  p.writeVarint(this.items.length);

  for (i = 0; i < this.items.length; i++)
    this.items[i].toRaw(true, p);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

AddrPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, count;

  count = p.readVarint();

  for (i = 0; i < count; i++)
    this.items.push(NetworkAddress.fromRaw(p, true));

  return this;
};

/**
 * Instantiate addr packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {AddrPacket}
 */

AddrPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new AddrPacket().fromRaw(data);
};

/**
 * Represents a `inv` packet.
 * @exports InvPacket
 * @constructor
 * @param {(InvItem[])?} items
 * @property {InvItem[]} items
 */

function InvPacket(items) {
  if (!(this instanceof InvPacket))
    return new InvPacket(items);

  Packet.call(this);

  this.items = items || [];
}

utils.inherits(InvPacket, Packet);

InvPacket.prototype.cmd = 'inv';
InvPacket.prototype.type = exports.types.INV;

/**
 * Serialize inv packet.
 * @returns {Buffer}
 */

InvPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);
  var i;

  p.writeVarint(this.items.length);

  for (i = 0; i < this.items.length; i++)
    this.items[i].toRaw(p);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

InvPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, count;

  count = p.readVarint();

  for (i = 0; i < count; i++)
    this.items.push(bcoin.invitem.fromRaw(p));

  return this;
};

/**
 * Instantiate inv packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {InvPacket}
 */

InvPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new InvPacket().fromRaw(data);
};

/**
 * Represents a `getdata` packet.
 * @exports GetDataPacket
 * @extends InvPacket
 * @constructor
 * @param {(InvItem[])?} items
 */

function GetDataPacket(items) {
  if (!(this instanceof GetDataPacket))
    return new GetDataPacket(items);

  InvPacket.call(this, items);
}

utils.inherits(GetDataPacket, InvPacket);

GetDataPacket.prototype.cmd = 'getdata';
GetDataPacket.prototype.type = exports.types.GETDATA;

/**
 * Instantiate getdata packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetDataPacket}
 */

GetDataPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new GetDataPacket().fromRaw(data);
};

/**
 * Represents a `notfound` packet.
 * @exports NotFoundPacket
 * @extends InvPacket
 * @constructor
 * @param {(InvItem[])?} items
 */

function NotFoundPacket(items) {
  if (!(this instanceof NotFoundPacket))
    return new NotFoundPacket(items);

  InvPacket.call(this, items);
}

utils.inherits(NotFoundPacket, InvPacket);

NotFoundPacket.prototype.cmd = 'notfound';
NotFoundPacket.prototype.type = exports.types.NOTFOUND;

/**
 * Instantiate notfound packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {NotFoundPacket}
 */

NotFoundPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new NotFoundPacket().fromRaw(data);
};

/**
 * Represents a `getblocks` packet.
 * @exports GetBlocksPacket
 * @constructor
 * @param {Hash[]} locator
 * @param {Hash?} stop
 * @property {Hash[]} locator
 * @property {Hash|null} stop
 */

function GetBlocksPacket(locator, stop) {
  if (!(this instanceof GetBlocksPacket))
    return new GetBlocksPacket(locator, stop);

  Packet.call(this);

  this.version = constants.VERSION;
  this.locator = locator || [];
  this.stop = stop || null;
}

utils.inherits(GetBlocksPacket, Packet);

GetBlocksPacket.prototype.cmd = 'getblocks';
GetBlocksPacket.prototype.type = exports.types.GETBLOCKS;

/**
 * Serialize getblocks packet.
 * @returns {Buffer}
 */

GetBlocksPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);
  var i;

  p.writeU32(this.version);
  p.writeVarint(this.locator.length);

  for (i = 0; i < this.locator.length; i++)
    p.writeHash(this.locator[i]);

  p.writeHash(this.stop || constants.ZERO_HASH);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

GetBlocksPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, count;

  this.version = p.readU32();

  count = p.readVarint();

  for (i = 0; i < count; i++)
    this.locator.push(p.readHash('hex'));

  this.stop = p.readHash('hex');

  if (this.stop === constants.NULL_HASH)
    this.stop = null;

  return this;
};

/**
 * Instantiate getblocks packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetBlocksPacket}
 */

GetBlocksPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new GetBlocksPacket().fromRaw(data);
};

/**
 * Represents a `getheaders` packet.
 * @exports GetHeadersPacket
 * @extends GetBlocksPacket
 * @constructor
 * @param {Hash[]} locator
 * @param {Hash?} stop
 */

function GetHeadersPacket(locator, stop) {
  if (!(this instanceof GetHeadersPacket))
    return new GetHeadersPacket(locator, stop);

  GetBlocksPacket.call(this, locator, stop);
}

utils.inherits(GetHeadersPacket, GetBlocksPacket);

GetHeadersPacket.prototype.cmd = 'getheaders';
GetHeadersPacket.prototype.type = exports.types.GETHEADERS;

/**
 * Instantiate getheaders packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetHeadersPacket}
 */

GetHeadersPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new GetHeadersPacket().fromRaw(data);
};

/**
 * Represents a `headers` packet.
 * @exports HeadersPacket
 * @constructor
 * @param {(Headers[])?} items
 * @property {Headers[]} items
 */

function HeadersPacket(items) {
  if (!(this instanceof HeadersPacket))
    return new HeadersPacket(items);

  Packet.call(this);

  this.items = items || [];
}

utils.inherits(HeadersPacket, Packet);

HeadersPacket.prototype.cmd = 'headers';
HeadersPacket.prototype.type = exports.types.HEADERS;

/**
 * Serialize headers packet.
 * @returns {Buffer}
 */

HeadersPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);
  var i;

  p.writeVarint(this.items.length);

  for (i = 0; i < this.items.length; i++)
    this.items[i].toRaw(p);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

HeadersPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, count;

  count = p.readVarint();

  for (i = 0; i < count; i++)
    this.items.push(bcoin.headers.fromRaw(p));

  return this;
};

/**
 * Instantiate headers packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {VerackPacket}
 */

HeadersPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new HeadersPacket().fromRaw(data);
};

/**
 * Represents a `sendheaders` packet.
 * @exports SendHeadersPacket
 * @constructor
 */

function SendHeadersPacket() {
  if (!(this instanceof SendHeadersPacket))
    return new SendHeadersPacket();

  Packet.call(this);
}

utils.inherits(SendHeadersPacket, Packet);

SendHeadersPacket.prototype.cmd = 'sendheaders';
SendHeadersPacket.prototype.type = exports.types.SENDHEADERS;

/**
 * Serialize sendheaders packet.
 * @returns {Buffer}
 */

SendHeadersPacket.prototype.toRaw = function toRaw(writer) {
  return writer || DUMMY;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

SendHeadersPacket.prototype.fromRaw = function fromRaw(data) {
  return this;
};

/**
 * Instantiate sendheaders packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {SendHeadersPacket}
 */

SendHeadersPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new SendHeadersPacket().fromRaw(data);
};

/**
 * Represents a `block` packet.
 * @exports BlockPacket
 * @constructor
 * @param {Block|null} block
 * @param {Boolean?} witness
 * @property {Block} block
 * @property {Boolean} witness
 */

function BlockPacket(block, witness) {
  if (!(this instanceof BlockPacket))
    return new BlockPacket(block, witness);

  Packet.call(this);

  this.block = block || new bcoin.memblock();
  this.witness = witness || false;
}

utils.inherits(BlockPacket, Packet);

BlockPacket.prototype.cmd = 'block';
BlockPacket.prototype.type = exports.types.BLOCK;

/**
 * Serialize block packet.
 * @returns {Buffer}
 */

BlockPacket.prototype.toRaw = function toRaw(writer) {
  if (this.witness)
    return this.block.toRaw(writer);
  return this.block.toNormal(writer);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

BlockPacket.prototype.fromRaw = function fromRaw(data) {
  this.block.fromRaw(data);
  return this;
};

/**
 * Instantiate block packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {BlockPacket}
 */

BlockPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new BlockPacket().fromRaw(data);
};

/**
 * Represents a `tx` packet.
 * @exports TXPacket
 * @constructor
 * @param {TX|null} tx
 * @param {Boolean?} witness
 * @property {TX} block
 * @property {Boolean} witness
 */

function TXPacket(tx, witness) {
  if (!(this instanceof TXPacket))
    return new TXPacket(tx, witness);

  Packet.call(this);

  this.tx = tx || new bcoin.tx();
  this.witness = witness || false;
}

utils.inherits(TXPacket, Packet);

TXPacket.prototype.cmd = 'tx';
TXPacket.prototype.type = exports.types.TX;

/**
 * Serialize tx packet.
 * @returns {Buffer}
 */

TXPacket.prototype.toRaw = function toRaw(writer) {
  if (this.witness)
    return this.tx.toRaw(writer);
  return this.tx.toNormal(writer);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

TXPacket.prototype.fromRaw = function fromRaw(data) {
  this.tx.fromRaw(data);
  return this;
};

/**
 * Instantiate tx packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {TXPacket}
 */

TXPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new TXPacket().fromRaw(data);
};

/**
 * Reject Packet
 * @exports RejectPacket
 * @constructor
 * @property {(Number|String)?} code - Code
 * (see {@link constants.reject}).
 * @property {String?} msg - Message.
 * @property {String?} reason - Reason.
 * @property {(Hash|Buffer)?} data - Transaction or block hash.
 */

function RejectPacket(options) {
  if (!(this instanceof RejectPacket))
    return new RejectPacket(options);

  Packet.call(this);

  this.message = '';
  this.code = constants.reject.INVALID;
  this.reason = '';
  this.data = null;

  if (options)
    this.fromOptions(options);
}

utils.inherits(RejectPacket, Packet);

RejectPacket.prototype.cmd = 'reject';
RejectPacket.prototype.type = exports.types.REJECT;

/**
 * Inject properties from options object.
 * @private
 * @param {Object} options
 */

RejectPacket.prototype.fromOptions = function fromOptions(options) {
  var code = options.code;

  if (options.message)
    this.message = options.message;

  if (code != null) {
    if (typeof code === 'string')
      code = constants.reject[code.toUpperCase()];

    if (code >= constants.reject.INTERNAL)
      code = constants.reject.INVALID;

    this.code = code;
  }

  if (options.reason)
    this.reason = options.reason;

  if (options.data)
    this.data = options.data;

  return this;
};

/**
 * Instantiate reject packet from options.
 * @param {Object} options
 * @returns {RejectPacket}
 */

RejectPacket.fromOptions = function fromOptions(options) {
  return new RejectPacket().fromOptions(options);
};

/**
 * Serialize reject packet.
 * @returns {Buffer}
 */

RejectPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  assert(this.message.length <= 12);
  assert(this.reason.length <= 111);

  p.writeVarString(this.message, 'ascii');
  p.writeU8(this.code);
  p.writeVarString(this.reason, 'ascii');

  if (this.data)
    p.writeHash(this.data);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

RejectPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);

  this.message = p.readVarString('ascii', 12);
  this.code = p.readU8();
  this.reason = p.readVarString('ascii', 111);

  if (this.message === 'block' || this.message === 'tx')
    this.data = p.readHash('hex');
  else
    this.data = null;

  return this;
};

/**
 * Instantiate reject packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {RejectPacket}
 */

RejectPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new RejectPacket().fromRaw(data, enc);
};

/**
 * Inject properties from reason message and object.
 * @private
 * @param {Number} code
 * @param {String} reason
 * @param {(TX|Block)?} obj
 */

RejectPacket.prototype.fromReason = function fromReason(code, reason, obj) {
  if (typeof code === 'string')
    code = constants.reject[code.toUpperCase()];

  if (!code)
    code = constants.reject.INVALID;

  if (code >= constants.reject.INTERNAL)
    code = constants.reject.INVALID;

  this.message = '';
  this.code = code;
  this.reason = reason;

  if (obj) {
    this.message = (obj instanceof bcoin.tx) ? 'tx' : 'block';
    this.data = obj.hash('hex');
  }

  return this;
};

/**
 * Instantiate reject packet from reason message.
 * @param {Number} code
 * @param {String} reason
 * @param {(TX|Block)?} obj
 * @returns {RejectPacket}
 */

RejectPacket.fromReason = function fromReason(code, reason, obj) {
  return new RejectPacket().fromReason(code, reason, obj);
};

/**
 * Instantiate reject packet from verify error.
 * @param {VerifyError} err
 * @param {(TX|Block)?} obj
 * @returns {RejectPacket}
 */

RejectPacket.fromError = function fromError(err, obj) {
  return RejectPacket.fromReason(err.code, err.reason, obj);
};

/**
 * Inspect reject packet.
 * @returns {String}
 */

RejectPacket.prototype.inspect = function inspect() {
  return '<Reject:'
    + ' msg=' + this.message
    + ' code=' + (constants.rejectByVal[this.code] || this.code)
    + ' reason=' + this.reason
    + ' data=' + this.data
    + '>';
};

/**
 * Represents a `mempool` packet.
 * @exports MempoolPacket
 * @constructor
 */

function MempoolPacket() {
  if (!(this instanceof MempoolPacket))
    return new MempoolPacket();

  Packet.call(this);
}

utils.inherits(MempoolPacket, Packet);

MempoolPacket.prototype.cmd = 'mempool';
MempoolPacket.prototype.type = exports.types.MEMPOOL;

/**
 * Serialize mempool packet.
 * @returns {Buffer}
 */

MempoolPacket.prototype.toRaw = function toRaw(writer) {
  return writer || DUMMY;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

MempoolPacket.prototype.fromRaw = function fromRaw(data) {
  return this;
};

/**
 * Instantiate mempool packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {VerackPacket}
 */

MempoolPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new MempoolPacket().fromRaw(data);
};

/**
 * Represents a `filterload` packet.
 * @exports FilterLoadPacket
 * @constructor
 * @param {Buffer|null} filter
 * @param {Number|null} n
 * @param {Number|null} tweak
 * @param {Number|null} update
 * @property {Buffer} filter
 * @property {Number} n
 * @property {Number} tweak
 * @property {Number} update
 */

function FilterLoadPacket(filter, n, tweak, update) {
  if (!(this instanceof FilterLoadPacket))
    return new FilterLoadPacket(filter, n, tweak, update);

  Packet.call(this);

  if (filter instanceof bcoin.bloom) {
    this.fromFilter(filter);
  } else {
    this.filter = filter || DUMMY;
    this.n = n || 0;
    this.tweak = tweak || 0;
    this.update = update || 0;
  }
}

utils.inherits(FilterLoadPacket, Packet);

FilterLoadPacket.prototype.cmd = 'filterload';
FilterLoadPacket.prototype.type = exports.types.FILTERLOAD;

/**
 * Serialize filterload packet.
 * @returns {Buffer}
 */

FilterLoadPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeVarBytes(this.filter);
  p.writeU32(this.n);
  p.writeU32(this.tweak);
  p.writeU8(this.update);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Serialize filterload packet.
 * @returns {Buffer}
 */

FilterLoadPacket.prototype.toFilter = function toFilter() {
  return new bcoin.bloom(this.filter, this.n, this.tweak, this.update);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

FilterLoadPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);

  this.filter = p.readVarBytes();
  this.n = p.readU32();
  this.tweak = p.readU32();
  this.update = p.readU8();

  assert(constants.filterFlagsByVal[this.update] != null, 'Bad filter flag.');

  return this;
};

/**
 * Inject properties from bloom filter.
 * @private
 * @param {Bloom} filter
 */

FilterLoadPacket.prototype.fromFilter = function fromFilter(filter) {
  this.filter = filter.filter;
  this.n = filter.n;
  this.tweak = filter.tweak;
  this.update = filter.update;
  return this;
};

/**
 * Instantiate filterload packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {FilterLoadPacket}
 */

FilterLoadPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new FilterLoadPacket().fromRaw(data);
};

/**
 * Instantiate filterload packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {FilterLoadPacket}
 */

FilterLoadPacket.fromFilter = function fromFilter(filter) {
  return new FilterLoadPacket().fromFilter(filter);
};

/**
 * Ensure the filter is within the size limits.
 * @returns {Boolean}
 */

FilterLoadPacket.prototype.isWithinConstraints = function isWithinConstraints() {
  if (this.filter.length > constants.bloom.MAX_BLOOM_FILTER_SIZE)
    return false;

  if (this.n > constants.bloom.MAX_HASH_FUNCS)
    return false;

  return true;
};

/**
 * Represents a `filteradd` packet.
 * @exports FilterAddPacket
 * @constructor
 * @param {Buffer?} data
 * @property {Buffer} data
 */

function FilterAddPacket(data) {
  if (!(this instanceof FilterAddPacket))
    return new FilterAddPacket(data);

  Packet.call(this);

  this.data = data || DUMMY;
}

utils.inherits(FilterAddPacket, Packet);

FilterAddPacket.prototype.cmd = 'filteradd';
FilterAddPacket.prototype.type = exports.types.FILTERADD;

/**
 * Serialize filteradd packet.
 * @returns {Buffer}
 */

FilterAddPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeVarBytes(this.data);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

FilterAddPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.data = p.readVarBytes();
  return this;
};

/**
 * Instantiate filteradd packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {FilterAddPacket}
 */

FilterAddPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new FilterAddPacket().fromRaw(data);
};

/**
 * Represents a `filterclear` packet.
 * @exports FilterClearPacket
 * @constructor
 */

function FilterClearPacket() {
  if (!(this instanceof FilterClearPacket))
    return new FilterClearPacket();

  Packet.call(this);
}

utils.inherits(FilterClearPacket, Packet);

FilterClearPacket.prototype.cmd = 'filterclear';
FilterClearPacket.prototype.type = exports.types.FILTERCLEAR;

/**
 * Serialize filterclear packet.
 * @returns {Buffer}
 */

FilterClearPacket.prototype.toRaw = function toRaw(writer) {
  return writer || DUMMY;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

FilterClearPacket.prototype.fromRaw = function fromRaw(data) {
  return this;
};

/**
 * Instantiate filterclear packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {FilterClearPacket}
 */

FilterClearPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new FilterClearPacket().fromRaw(data);
};

/**
 * Represents a `merkleblock` packet.
 * @exports MerkleBlockPacket
 * @constructor
 * @param {MerkleBlock?} block
 * @property {MerkleBlock} block
 */

function MerkleBlockPacket(block) {
  if (!(this instanceof MerkleBlockPacket))
    return new MerkleBlockPacket(block);

  Packet.call(this);

  this.block = block || new bcoin.merkleblock();
}

utils.inherits(MerkleBlockPacket, Packet);

MerkleBlockPacket.prototype.cmd = 'merkleblock';
MerkleBlockPacket.prototype.type = exports.types.MERKLEBLOCK;

/**
 * Serialize merkleblock packet.
 * @returns {Buffer}
 */

MerkleBlockPacket.prototype.toRaw = function toRaw(writer) {
  return this.block.toRaw(writer);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

MerkleBlockPacket.prototype.fromRaw = function fromRaw(data) {
  this.block.fromRaw(data);
  return this;
};

/**
 * Instantiate merkleblock packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {MerkleBlockPacket}
 */

MerkleBlockPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new MerkleBlockPacket().fromRaw(data);
};

/**
 * Represents a `getutxos` packet.
 * @exports GetUTXOsPacket
 * @constructor
 * @param {Boolean} mempool
 * @param {Outpoint[]} prevout
 * @property {Boolean} mempool
 * @property {Outpoint[]} prevout
 */

function GetUTXOsPacket(mempool, prevout) {
  if (!(this instanceof GetUTXOsPacket))
    return new GetUTXOsPacket(mempool, prevout);

  Packet.call(this);

  this.mempool = mempool || false;
  this.prevout = prevout || [];
}

utils.inherits(GetUTXOsPacket, Packet);

GetUTXOsPacket.prototype.cmd = 'getutxos';
GetUTXOsPacket.prototype.type = exports.types.GETUTXOS;

/**
 * Serialize getutxos packet.
 * @returns {Buffer}
 */

GetUTXOsPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);
  var i;

  p.writeU8(this.mempool ? 1 : 0);
  p.writeVarint(this.prevout.length);

  for (i = 0; i < this.prevout.length; i++)
    this.prevout[i].toRaw(p);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

GetUTXOsPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, count;

  this.mempool = p.readU8() === 1;

  count = p.readVarint();

  for (i = 0; i < count; i++)
    this.prevout.push(bcoin.outpoint.fromRaw(p));

  return this;
};

/**
 * Instantiate getutxos packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetBlocksPacket}
 */

GetUTXOsPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new GetUTXOsPacket().fromRaw(data);
};

/**
 * Represents a `utxos` packet.
 * @exports UTXOsPacket
 * @constructor
 * @param {Object} options
 * @property {Number} height
 * @property {Hash} tip
 * @property {Boolean[]} hits
 * @property {Coin[]} coins
 */

function UTXOsPacket(options) {
  if (!(this instanceof UTXOsPacket))
    return new UTXOsPacket(options);

  Packet.call(this);

  this.height = -1;
  this.tip = constants.NULL_HASH;
  this.hits = [];
  this.coins = [];

  if (options)
    this.fromOptions(options);
}

utils.inherits(UTXOsPacket, Packet);

UTXOsPacket.prototype.cmd = 'utxos';
UTXOsPacket.prototype.type = exports.types.UTXOS;

/**
 * Inject properties from options.
 * @private
 * @param {Buffer} data
 */

UTXOsPacket.prototype.fromOptions = function fromOptions(options) {
  if (options.height != null) {
    assert(utils.isNumber(options.height));
    this.height = options.height;
  }

  if (options.tip) {
    assert(typeof options.tip === 'string');
    this.tip = options.tip;
  }

  if (options.hits) {
    assert(Array.isArray(options.hits));
    this.hits = options.hits;
  }

  if (options.coins) {
    assert(Array.isArray(options.coins));
    this.coins = options.coins;
  }

  return this;
};

/**
 * Instantiate utxos packet from options.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetBlocksPacket}
 */

UTXOsPacket.fromOptions = function fromOptions(options) {
  return new UTXOsPacket().fromOptions(options);
};

/**
 * Serialize utxos packet.
 * @returns {Buffer}
 */

UTXOsPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);
  var map = new Buffer((this.hits.length + 7) / 8 | 0);
  var i, bit, oct, coin, height;

  for (i = 0; i < this.hits.length; i++) {
    bit = i % 8;
    oct = (i - bit) / 8;
    map[oct] |= +this.hits[i] << (7 - bit);
  }

  p.writeU32(this.height);
  p.writeHash(this.tip);
  p.writeVarBytes(map);
  p.writeVarInt(this.coins.length);

  for (i = 0; i < this.coins.length; i++) {
    coin = this.coins[i];
    height = coin.height;

    if (height === -1)
      height = 0x7fffffff;

    p.writeU32(coin.version);
    p.writeU32(height);
    p.write64(coin.value);
    p.writeVarBytes(coin.script.toRaw());
  }

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

UTXOsPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  var i, bit, oct, coin, output;
  var version, height, map, count;

  this.height = p.readU32();
  this.tip = p.readHash('hex');

  map = p.readVarBytes();
  count = p.readVarint();

  for (i = 0; i < map.length * 8; i++) {
    bit = i % 8;
    oct = (i - bit) / 8;
    this.hits.push((map[oct] >> (7 - bit)) & 1);
  }

  for (i = 0; i < count; i++) {
    version = p.readU32();
    height = p.readU32();
    coin = new bcoin.coin();

    if (height === 0x7fffffff)
      height = -1;

    output = bcoin.output.fromRaw(p);

    coin.version = version;
    coin.height = height;
    coin.script = output.script;
    coin.value = output.value;

    this.coins.push(coin);
  }

  return this;
};

/**
 * Instantiate utxos packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {UTXOsPacket}
 */

UTXOsPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new UTXOsPacket().fromRaw(data);
};

/**
 * Represents a `havewitness` packet.
 * @exports HaveWitnessPacket
 * @constructor
 */

function HaveWitnessPacket() {
  if (!(this instanceof HaveWitnessPacket))
    return new HaveWitnessPacket();

  Packet.call(this);
}

utils.inherits(HaveWitnessPacket, Packet);

HaveWitnessPacket.prototype.cmd = 'havewitness';
HaveWitnessPacket.prototype.type = exports.types.HAVEWITNESS;

/**
 * Serialize havewitness packet.
 * @returns {Buffer}
 */

HaveWitnessPacket.prototype.toRaw = function toRaw(writer) {
  return writer || DUMMY;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

HaveWitnessPacket.prototype.fromRaw = function fromRaw(data) {
  return this;
};

/**
 * Instantiate havewitness packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {HaveWitnessPacket}
 */

HaveWitnessPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new HaveWitnessPacket().fromRaw(data);
};

/**
 * Represents a `feefilter` packet.
 * @exports FeeFilterPacket
 * @constructor
 * @param {Rate?} rate
 * @property {Rate} rate
 */

function FeeFilterPacket(rate) {
  if (!(this instanceof FeeFilterPacket))
    return new FeeFilterPacket(rate);

  Packet.call(this);

  this.rate = rate || 0;
}

utils.inherits(FeeFilterPacket, Packet);

FeeFilterPacket.prototype.cmd = 'feefilter';
FeeFilterPacket.prototype.type = exports.types.FEEFILTER;

/**
 * Serialize feefilter packet.
 * @returns {Buffer}
 */

FeeFilterPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.write64(this.rate);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

FeeFilterPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.rate = p.read64N();
  return this;
};

/**
 * Instantiate feefilter packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {FeeFilterPacket}
 */

FeeFilterPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new FeeFilterPacket().fromRaw(data);
};

/**
 * Represents a `sendcmpct` packet.
 * @exports SendCmpctPacket
 * @constructor
 * @param {Number|null} mode
 * @param {Number|null} version
 * @property {Number} mode
 * @property {Number} version
 */

function SendCmpctPacket(mode, version) {
  if (!(this instanceof SendCmpctPacket))
    return new SendCmpctPacket(mode, version);

  Packet.call(this);

  this.mode = mode || 0;
  this.version = version || 1;
}

utils.inherits(SendCmpctPacket, Packet);

SendCmpctPacket.prototype.cmd = 'sendcmpct';
SendCmpctPacket.prototype.type = exports.types.SENDCMPCT;

/**
 * Serialize sendcmpct packet.
 * @returns {Buffer}
 */

SendCmpctPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeU8(this.mode);
  p.writeU64(this.version);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

SendCmpctPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.mode = p.readU8();
  this.version = p.readU53();
  return this;
};

/**
 * Instantiate sendcmpct packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {SendCmpctPacket}
 */

SendCmpctPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new SendCmpctPacket().fromRaw(data);
};

/**
 * Represents a `cmpctblock` packet.
 * @exports CmpctBlockPacket
 * @constructor
 * @param {Block|null} block
 * @param {Boolean|null} witness
 * @property {Block} block
 * @property {Boolean} witness
 */

function CmpctBlockPacket(block, witness) {
  if (!(this instanceof CmpctBlockPacket))
    return new CmpctBlockPacket(block, witness);

  Packet.call(this);

  this.block = block || new bcoin.bip152.CompactBlock();
  this.witness = witness || false;
}

utils.inherits(CmpctBlockPacket, Packet);

CmpctBlockPacket.prototype.cmd = 'cmpctblock';
CmpctBlockPacket.prototype.type = exports.types.CMPCTBLOCK;

/**
 * Serialize cmpctblock packet.
 * @returns {Buffer}
 */

CmpctBlockPacket.prototype.toRaw = function toRaw(writer) {
  if (this.witness)
    return this.block.toRaw(writer);
  return this.block.toNormal(writer);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

CmpctBlockPacket.prototype.fromRaw = function fromRaw(data) {
  this.block.fromRaw(data);
  return this;
};

/**
 * Instantiate cmpctblock packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {CmpctBlockPacket}
 */

CmpctBlockPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new CmpctBlockPacket().fromRaw(data);
};

/**
 * Represents a `getblocktxn` packet.
 * @exports GetBlockTxnPacket
 * @constructor
 * @param {TXRequest?} request
 * @property {TXRequest} request
 */

function GetBlockTxnPacket(request) {
  if (!(this instanceof GetBlockTxnPacket))
    return new GetBlockTxnPacket(request);

  Packet.call(this);

  this.request = request || new bcoin.bip152.TXRequest();
}

utils.inherits(GetBlockTxnPacket, Packet);

GetBlockTxnPacket.prototype.cmd = 'getblocktxn';
GetBlockTxnPacket.prototype.type = exports.types.GETBLOCKTXN;

/**
 * Serialize getblocktxn packet.
 * @returns {Buffer}
 */

GetBlockTxnPacket.prototype.toRaw = function toRaw(writer) {
  return this.request.toRaw(writer);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

GetBlockTxnPacket.prototype.fromRaw = function fromRaw(data) {
  this.request.fromRaw(data);
  return this;
};

/**
 * Instantiate getblocktxn packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {GetBlockTxnPacket}
 */

GetBlockTxnPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new GetBlockTxnPacket().fromRaw(data);
};

/**
 * Represents a `blocktxn` packet.
 * @exports BlockTxnPacket
 * @constructor
 * @param {TXResponse?} response
 * @param {Boolean?} witness
 * @property {TXResponse} response
 * @property {Boolean} witness
 */

function BlockTxnPacket(response, witness) {
  if (!(this instanceof BlockTxnPacket))
    return new BlockTxnPacket(response, witness);

  Packet.call(this);

  this.response = response || new bcoin.bip152.TXResponse();
  this.witness = witness || false;
}

utils.inherits(BlockTxnPacket, Packet);

BlockTxnPacket.prototype.cmd = 'blocktxn';
BlockTxnPacket.prototype.type = exports.types.BLOCKTXN;

/**
 * Serialize blocktxn packet.
 * @returns {Buffer}
 */

BlockTxnPacket.prototype.toRaw = function toRaw(writer) {
  if (this.witness)
    return this.response.toRaw(writer);
  return this.response.toNormal(writer);
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

BlockTxnPacket.prototype.fromRaw = function fromRaw(data) {
  this.response.fromRaw(data);
  return this;
};

/**
 * Instantiate blocktxn packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {BlockTxnPacket}
 */

BlockTxnPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new BlockTxnPacket().fromRaw(data);
};

/**
 * Represents a `encinit` packet.
 * @exports EncinitPacket
 * @constructor
 * @param {Buffer|null} publicKey
 * @param {Number|null} cipher
 * @property {Buffer} publicKey
 * @property {Number} cipher
 */

function EncinitPacket(publicKey, cipher) {
  if (!(this instanceof EncinitPacket))
    return new EncinitPacket(publicKey, cipher);

  Packet.call(this);

  this.publicKey = publicKey || constants.ZERO_KEY;
  this.cipher = cipher || 0;
}

utils.inherits(EncinitPacket, Packet);

EncinitPacket.prototype.cmd = 'encinit';
EncinitPacket.prototype.type = exports.types.ENCINIT;

/**
 * Serialize encinit packet.
 * @returns {Buffer}
 */

EncinitPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeBytes(this.publicKey);
  p.writeU8(this.cipher);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

EncinitPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.publicKey = p.readBytes(33);
  this.cipher = p.readU8();
  return this;
};

/**
 * Instantiate getblocks packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {EncinitPacket}
 */

EncinitPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new EncinitPacket().fromRaw(data);
};

/**
 * Represents a `encack` packet.
 * @exports EncackPacket
 * @constructor
 * @param {Buffer?} publicKey
 * @property {Buffer} publicKey
 */

function EncackPacket(publicKey) {
  if (!(this instanceof EncackPacket))
    return new EncackPacket(publicKey);

  Packet.call(this);

  this.publicKey = publicKey || constants.ZERO_KEY;
}

utils.inherits(EncackPacket, Packet);

EncackPacket.prototype.cmd = 'encack';
EncackPacket.prototype.type = exports.types.ENCACK;

/**
 * Serialize encack packet.
 * @returns {Buffer}
 */

EncackPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeBytes(this.publicKey);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

EncackPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.publicKey = p.readBytes(33);
  return this;
};

/**
 * Instantiate encack packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {EncackPacket}
 */

EncackPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new EncackPacket().fromRaw(data);
};

/**
 * Represents a `authchallenge` packet.
 * @exports AuthChallengePacket
 * @constructor
 * @param {Buffer?} hash
 * @property {Buffer} hash
 */

function AuthChallengePacket(hash) {
  if (!(this instanceof AuthChallengePacket))
    return new AuthChallengePacket(hash);

  Packet.call(this);

  this.hash = hash || constants.ZERO_HASH;
}

utils.inherits(AuthChallengePacket, Packet);

AuthChallengePacket.prototype.cmd = 'authchallenge';
AuthChallengePacket.prototype.type = exports.types.AUTHCHALLENGE;

/**
 * Serialize authchallenge packet.
 * @returns {Buffer}
 */

AuthChallengePacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeBytes(this.hash);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

AuthChallengePacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.hash = p.readHash();
  return this;
};

/**
 * Instantiate authchallenge packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {AuthChallengePacket}
 */

AuthChallengePacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new AuthChallengePacket().fromRaw(data);
};

/**
 * Represents a `authreply` packet.
 * @exports AuthReplyPacket
 * @constructor
 * @param {Buffer?} signature
 * @property {Buffer} signature
 */

function AuthReplyPacket(signature) {
  if (!(this instanceof AuthReplyPacket))
    return new AuthReplyPacket(signature);

  Packet.call(this);

  this.signature = signature || constants.ZERO_SIG64;
}

utils.inherits(AuthReplyPacket, Packet);

AuthReplyPacket.prototype.cmd = 'authreply';
AuthReplyPacket.prototype.type = exports.types.AUTHREPLY;

/**
 * Serialize authreply packet.
 * @returns {Buffer}
 */

AuthReplyPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeBytes(this.signature);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

AuthReplyPacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.signature = p.readBytes(64);
  return this;
};

/**
 * Instantiate authreply packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {AuthReplyPacket}
 */

AuthReplyPacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new AuthReplyPacket().fromRaw(data);
};

/**
 * Represents a `authpropose` packet.
 * @exports AuthProposePacket
 * @constructor
 * @param {Hash?} hash
 * @property {Hash} hash
 */

function AuthProposePacket(hash) {
  if (!(this instanceof AuthProposePacket))
    return new AuthProposePacket(hash);

  Packet.call(this);

  this.hash = hash || constants.ZERO_HASH;
}

utils.inherits(AuthProposePacket, Packet);

AuthProposePacket.prototype.cmd = 'authpropose';
AuthProposePacket.prototype.type = exports.types.AUTHPROPOSE;

/**
 * Serialize authpropose packet.
 * @returns {Buffer}
 */

AuthProposePacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeBytes(this.hash);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

AuthProposePacket.prototype.fromRaw = function fromRaw(data) {
  var p = bcoin.reader(data);
  this.hash = p.readHash();
  return this;
};

/**
 * Instantiate authpropose packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {AuthProposePacket}
 */

AuthProposePacket.fromRaw = function fromRaw(data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new AuthProposePacket().fromRaw(data);
};

/**
 * Represents an unknown packet.
 * @exports UnknownPacket
 * @constructor
 * @param {String|null} cmd
 * @param {Buffer|null} data
 * @property {String} cmd
 * @property {Buffer} data
 */

function UnknownPacket(cmd, data) {
  if (!(this instanceof UnknownPacket))
    return new UnknownPacket(cmd, data);

  Packet.call(this);

  this.cmd = cmd;
  this.data = data;
}

utils.inherits(UnknownPacket, Packet);

UnknownPacket.prototype.type = exports.types.UNKNOWN;

/**
 * Serialize unknown packet.
 * @returns {Buffer}
 */

UnknownPacket.prototype.toRaw = function toRaw(writer) {
  var p = bcoin.writer(writer);

  p.writeBytes(this.data);

  if (!writer)
    p = p.render();

  return p;
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 */

UnknownPacket.prototype.fromRaw = function fromRaw(cmd, data) {
  assert(Buffer.isBuffer(data));
  this.cmd = cmd;
  this.data = data;
  return this;
};

/**
 * Instantiate unknown packet from serialized data.
 * @param {Buffer} data
 * @param {String?} enc
 * @returns {UnknownPacket}
 */

UnknownPacket.fromRaw = function fromRaw(cmd, data, enc) {
  if (typeof data === 'string')
    data = new Buffer(data, enc);
  return new UnknownPacket().fromRaw(cmd, data);
};

/**
 * Parse a payload.
 * @param {String} cmd
 * @param {Buffer} data
 * @returns {Packet}
 */

exports.fromRaw = function fromRaw(cmd, data) {
  switch (cmd) {
    case 'version':
      return VersionPacket.fromRaw(data);
    case 'verack':
      return VerackPacket.fromRaw(data);
    case 'ping':
      return PingPacket.fromRaw(data);
    case 'pong':
      return PongPacket.fromRaw(data);
    case 'alert':
      return AlertPacket.fromRaw(data);
    case 'getaddr':
      return GetAddrPacket.fromRaw(data);
    case 'addr':
      return AddrPacket.fromRaw(data);
    case 'inv':
      return InvPacket.fromRaw(data);
    case 'getdata':
      return GetDataPacket.fromRaw(data);
    case 'notfound':
      return NotFoundPacket.fromRaw(data);
    case 'getblocks':
      return GetBlocksPacket.fromRaw(data);
    case 'getheaders':
      return GetHeadersPacket.fromRaw(data);
    case 'headers':
      return HeadersPacket.fromRaw(data);
    case 'sendheaders':
      return SendHeadersPacket.fromRaw(data);
    case 'block':
      return BlockPacket.fromRaw(data);
    case 'tx':
      return TXPacket.fromRaw(data);
    case 'reject':
      return RejectPacket.fromRaw(data);
    case 'mempool':
      return MempoolPacket.fromRaw(data);
    case 'filterload':
      return FilterLoadPacket.fromRaw(data);
    case 'filteradd':
      return FilterAddPacket.fromRaw(data);
    case 'filterclear':
      return FilterClearPacket.fromRaw(data);
    case 'merkleblock':
      return MerkleBlockPacket.fromRaw(data);
    case 'getutxos':
      return GetUTXOsPacket.fromRaw(data);
    case 'utxos':
      return UTXOsPacket.fromRaw(data);
    case 'havewitness':
      return HaveWitnessPacket.fromRaw(data);
    case 'feefilter':
      return FeeFilterPacket.fromRaw(data);
    case 'sendcmpct':
      return SendCmpctPacket.fromRaw(data);
    case 'cmpctblock':
      return CmpctBlockPacket.fromRaw(data);
    case 'getblocktxn':
      return GetBlockTxnPacket.fromRaw(data);
    case 'blocktxn':
      return BlockTxnPacket.fromRaw(data);
    case 'encinit':
      return EncinitPacket.fromRaw(data);
    case 'encack':
      return EncackPacket.fromRaw(data);
    case 'authchallenge':
      return AuthChallengePacket.fromRaw(data);
    case 'authreply':
      return AuthReplyPacket.fromRaw(data);
    case 'authpropose':
      return AuthProposePacket.fromRaw(data);
    default:
      return UnknownPacket.fromRaw(cmd, data);
  }
};

/*
 * Expose
 */

exports.Packet = Packet;
exports.VersionPacket = VersionPacket;
exports.VerackPacket = VerackPacket;
exports.PingPacket = PingPacket;
exports.PongPacket = PongPacket;
exports.AlertPacket = AlertPacket;
exports.GetAddrPacket = GetAddrPacket;
exports.AddrPacket = AddrPacket;
exports.InvPacket = InvPacket;
exports.GetDataPacket = GetDataPacket;
exports.NotFoundPacket = NotFoundPacket;
exports.GetBlocksPacket = GetBlocksPacket;
exports.GetHeadersPacket = GetHeadersPacket;
exports.HeadersPacket = HeadersPacket;
exports.SendHeadersPacket = SendHeadersPacket;
exports.BlockPacket = BlockPacket;
exports.TXPacket = TXPacket;
exports.RejectPacket = RejectPacket;
exports.MempoolPacket = MempoolPacket;
exports.FilterLoadPacket = FilterLoadPacket;
exports.FilterAddPacket = FilterAddPacket;
exports.FilterClearPacket = FilterClearPacket;
exports.MerkleBlockPacket = MerkleBlockPacket;
exports.GetUTXOsPacket = GetUTXOsPacket;
exports.UTXOsPacket = UTXOsPacket;
exports.HaveWitnessPacket = HaveWitnessPacket;
exports.FeeFilterPacket = FeeFilterPacket;
exports.SendCmpctPacket = SendCmpctPacket;
exports.CmpctBlockPacket = CmpctBlockPacket;
exports.GetBlockTxnPacket = GetBlockTxnPacket;
exports.BlockTxnPacket = BlockTxnPacket;
exports.EncinitPacket = EncinitPacket;
exports.EncackPacket = EncackPacket;
exports.AuthChallengePacket = AuthChallengePacket;
exports.AuthReplyPacket = AuthReplyPacket;
exports.AuthProposePacket = AuthProposePacket;
exports.UnknownPacket = UnknownPacket;
