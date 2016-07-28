(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Safari 5-7 lacks support for changing the `Object.prototype.constructor` property
 *     on objects.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  function Bar () {}
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    arr.constructor = Bar
    return arr.foo() === 42 && // typed array instances can be augmented
        arr.constructor === Bar && // constructor can be set
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    array.byteLength
    that = Buffer._augment(new Uint8Array(array))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` is deprecated
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` is deprecated
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":2,"ieee754":3,"is-array":4}],2:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],3:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],4:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],5:[function(require,module,exports){
// Copyright 2014 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//     You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//     See the License for the specific language governing permissions and
// limitations under the License.

!function(a,b){b["true"]=a,function(){if(document.documentElement.animate){var a=document.documentElement.animate([],0),b=!0;if(a&&(b=!1,"play|currentTime|pause|reverse|playbackRate|cancel|finish|startTime|playState".split("|").forEach(function(c){void 0===a[c]&&(b=!0)})),!b)return}var c={},d={},e={},f=null;!function(a){function b(a){if("number"==typeof a)return a;var b={};for(var c in a)b[c]=a[c];return b}function c(){this._delay=0,this._endDelay=0,this._fill="none",this._iterationStart=0,this._iterations=1,this._duration=0,this._playbackRate=1,this._direction="normal",this._easing="linear"}function d(b,d){var e=new c;return d&&(e.fill="both",e.duration="auto"),"number"!=typeof b||isNaN(b)?void 0!==b&&Object.getOwnPropertyNames(b).forEach(function(c){if("auto"!=b[c]){if(("number"==typeof e[c]||"duration"==c)&&("number"!=typeof b[c]||isNaN(b[c])))return;if("fill"==c&&-1==s.indexOf(b[c]))return;if("direction"==c&&-1==t.indexOf(b[c]))return;if("playbackRate"==c&&1!==b[c]&&a.isDeprecated("AnimationEffectTiming.playbackRate","2014-11-28","Use Animation.playbackRate instead."))return;e[c]=b[c]}}):e.duration=b,e}function e(a){return"number"==typeof a&&(a=isNaN(a)?{duration:0}:{duration:a}),a}function f(b,c){b=a.numericTimingToObject(b);var e=d(b,c);return e._easing=i(e.easing),e}function g(a,b,c,d){return 0>a||a>1||0>c||c>1?B:function(e){function f(a,b,c){return 3*a*(1-c)*(1-c)*c+3*b*(1-c)*c*c+c*c*c}if(0==e||1==e)return e;for(var g=0,h=1;;){var i=(g+h)/2,j=f(a,c,i);if(Math.abs(e-j)<.001)return f(b,d,i);e>j?g=i:h=i}}}function h(a,b){return function(c){if(c>=1)return 1;var d=1/a;return c+=b*d,c-c%d}}function i(a){var b=z.exec(a);if(b)return g.apply(this,b.slice(1).map(Number));var c=A.exec(a);if(c)return h(Number(c[1]),{start:u,middle:v,end:w}[c[2]]);var d=x[a];return d?d:B}function j(a){return Math.abs(k(a)/a.playbackRate)}function k(a){return a.duration*a.iterations}function l(a,b,c){return null==b?C:b<c.delay?D:b>=c.delay+a?E:F}function m(a,b,c,d,e){switch(d){case D:return"backwards"==b||"both"==b?0:null;case F:return c-e;case E:return"forwards"==b||"both"==b?a:null;case C:return null}}function n(a,b,c,d){return(d.playbackRate<0?b-a:b)*d.playbackRate+c}function o(a,b,c,d,e){return 1/0===c||c===-1/0||c-d==b&&e.iterations&&(e.iterations+e.iterationStart)%1==0?a:c%a}function p(a,b,c,d){return 0===c?0:b==a?d.iterationStart+d.iterations-1:Math.floor(c/a)}function q(a,b,c,d){var e=a%2>=1,f="normal"==d.direction||d.direction==(e?"alternate-reverse":"alternate"),g=f?c:b-c,h=g/b;return b*d.easing(h)}function r(a,b,c){var d=l(a,b,c),e=m(a,c.fill,b,d,c.delay);if(null===e)return null;if(0===a)return d===D?0:1;var f=c.iterationStart*c.duration,g=n(a,e,f,c),h=o(c.duration,k(c),g,f,c),i=p(c.duration,h,g,c);return q(i,c.duration,h,c)/c.duration}var s="backwards|forwards|both|none".split("|"),t="reverse|alternate|alternate-reverse".split("|");c.prototype={_setMember:function(b,c){this["_"+b]=c,this._effect&&(this._effect._timingInput[b]=c,this._effect._timing=a.normalizeTimingInput(a.normalizeTimingInput(this._effect._timingInput)),this._effect.activeDuration=a.calculateActiveDuration(this._effect._timing),this._effect._animation&&this._effect._animation._rebuildUnderlyingAnimation())},get playbackRate(){return this._playbackRate},set delay(a){this._setMember("delay",a)},get delay(){return this._delay},set endDelay(a){this._setMember("endDelay",a)},get endDelay(){return this._endDelay},set fill(a){this._setMember("fill",a)},get fill(){return this._fill},set iterationStart(a){this._setMember("iterationStart",a)},get iterationStart(){return this._iterationStart},set duration(a){this._setMember("duration",a)},get duration(){return this._duration},set direction(a){this._setMember("direction",a)},get direction(){return this._direction},set easing(a){this._setMember("easing",a)},get easing(){return this._easing},set iterations(a){this._setMember("iterations",a)},get iterations(){return this._iterations}};var u=1,v=.5,w=0,x={ease:g(.25,.1,.25,1),"ease-in":g(.42,0,1,1),"ease-out":g(0,0,.58,1),"ease-in-out":g(.42,0,.58,1),"step-start":h(1,u),"step-middle":h(1,v),"step-end":h(1,w)},y="\\s*(-?\\d+\\.?\\d*|-?\\.\\d+)\\s*",z=new RegExp("cubic-bezier\\("+y+","+y+","+y+","+y+"\\)"),A=/steps\(\s*(\d+)\s*,\s*(start|middle|end)\s*\)/,B=function(a){return a},C=0,D=1,E=2,F=3;a.cloneTimingInput=b,a.makeTiming=d,a.numericTimingToObject=e,a.normalizeTimingInput=f,a.calculateActiveDuration=j,a.calculateTimeFraction=r,a.calculatePhase=l,a.toTimingFunction=i}(c,f),function(a){function b(a,b){return a in h?h[a][b]||b:b}function c(a,c,d){var g=e[a];if(g){f.style[a]=c;for(var h in g){var i=g[h],j=f.style[i];d[i]=b(i,j)}}else d[a]=b(a,c)}function d(b){function d(){var a=e.length;null==e[a-1].offset&&(e[a-1].offset=1),a>1&&null==e[0].offset&&(e[0].offset=0);for(var b=0,c=e[0].offset,d=1;a>d;d++){var f=e[d].offset;if(null!=f){for(var g=1;d-b>g;g++)e[b+g].offset=c+(f-c)*g/(d-b);b=d,c=f}}}if(!Array.isArray(b)&&null!==b)throw new TypeError("Keyframes must be null or an array of keyframes");if(null==b)return[];for(var e=b.map(function(b){var d={};for(var e in b){var f=b[e];if("offset"==e){if(null!=f&&(f=Number(f),!isFinite(f)))throw new TypeError("keyframe offsets must be numbers.")}else{if("composite"==e)throw{type:DOMException.NOT_SUPPORTED_ERR,name:"NotSupportedError",message:"add compositing is not supported"};f="easing"==e?a.toTimingFunction(f):""+f}c(e,f,d)}return void 0==d.offset&&(d.offset=null),void 0==d.easing&&(d.easing=a.toTimingFunction("linear")),d}),f=!0,g=-1/0,h=0;h<e.length;h++){var i=e[h].offset;if(null!=i){if(g>i)throw{code:DOMException.INVALID_MODIFICATION_ERR,name:"InvalidModificationError",message:"Keyframes are not loosely sorted by offset. Sort or specify offsets."};g=i}else f=!1}return e=e.filter(function(a){return a.offset>=0&&a.offset<=1}),f||d(),e}var e={background:["backgroundImage","backgroundPosition","backgroundSize","backgroundRepeat","backgroundAttachment","backgroundOrigin","backgroundClip","backgroundColor"],border:["borderTopColor","borderTopStyle","borderTopWidth","borderRightColor","borderRightStyle","borderRightWidth","borderBottomColor","borderBottomStyle","borderBottomWidth","borderLeftColor","borderLeftStyle","borderLeftWidth"],borderBottom:["borderBottomWidth","borderBottomStyle","borderBottomColor"],borderColor:["borderTopColor","borderRightColor","borderBottomColor","borderLeftColor"],borderLeft:["borderLeftWidth","borderLeftStyle","borderLeftColor"],borderRadius:["borderTopLeftRadius","borderTopRightRadius","borderBottomRightRadius","borderBottomLeftRadius"],borderRight:["borderRightWidth","borderRightStyle","borderRightColor"],borderTop:["borderTopWidth","borderTopStyle","borderTopColor"],borderWidth:["borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth"],flex:["flexGrow","flexShrink","flexBasis"],font:["fontFamily","fontSize","fontStyle","fontVariant","fontWeight","lineHeight"],margin:["marginTop","marginRight","marginBottom","marginLeft"],outline:["outlineColor","outlineStyle","outlineWidth"],padding:["paddingTop","paddingRight","paddingBottom","paddingLeft"]},f=document.createElementNS("http://www.w3.org/1999/xhtml","div"),g={thin:"1px",medium:"3px",thick:"5px"},h={borderBottomWidth:g,borderLeftWidth:g,borderRightWidth:g,borderTopWidth:g,fontSize:{"xx-small":"60%","x-small":"75%",small:"89%",medium:"100%",large:"120%","x-large":"150%","xx-large":"200%"},fontWeight:{normal:"400",bold:"700"},outlineWidth:g,textShadow:{none:"0px 0px 0px transparent"},boxShadow:{none:"0px 0px 0px 0px transparent"}};a.normalizeKeyframes=d}(c,f),function(a){var b={};a.isDeprecated=function(a,c,d,e){var f=e?"are":"is",g=new Date,h=new Date(c);return h.setMonth(h.getMonth()+3),h>g?(a in b||console.warn("Web Animations: "+a+" "+f+" deprecated and will stop working on "+h.toDateString()+". "+d),b[a]=!0,!1):!0},a.deprecated=function(b,c,d,e){var f=e?"are":"is";if(a.isDeprecated(b,c,d,e))throw new Error(b+" "+f+" no longer supported. "+d)}}(c),function(a,b){function c(a){for(var b={},c=0;c<a.length;c++)for(var d in a[c])if("offset"!=d&&"easing"!=d&&"composite"!=d){var e={offset:a[c].offset,easing:a[c].easing,value:a[c][d]};b[d]=b[d]||[],b[d].push(e)}for(var f in b){var g=b[f];if(0!=g[0].offset||1!=g[g.length-1].offset)throw{type:DOMException.NOT_SUPPORTED_ERR,name:"NotSupportedError",message:"Partial keyframes are not supported"}}return b}function d(a){var c=[];for(var d in a)for(var e=a[d],f=0;f<e.length-1;f++){var g=e[f].offset,h=e[f+1].offset,i=e[f].value,j=e[f+1].value;g==h&&(1==h?i=j:j=i),c.push({startTime:g,endTime:h,easing:e[f].easing,property:d,interpolation:b.propertyInterpolation(d,i,j)})}return c.sort(function(a,b){return a.startTime-b.startTime}),c}b.convertEffectInput=function(e){var f=a.normalizeKeyframes(e),g=c(f),h=d(g);return function(a,c){if(null!=c)h.filter(function(a){return 0>=c&&0==a.startTime||c>=1&&1==a.endTime||c>=a.startTime&&c<=a.endTime}).forEach(function(d){var e=c-d.startTime,f=d.endTime-d.startTime,g=0==f?0:d.easing(e/f);b.apply(a,d.property,d.interpolation(g))});else for(var d in g)"offset"!=d&&"easing"!=d&&"composite"!=d&&b.clear(a,d)}}}(c,d,f),function(a){function b(a,b,c){e[c]=e[c]||[],e[c].push([a,b])}function c(a,c,d){for(var e=0;e<d.length;e++){var f=d[e];b(a,c,f),/-/.test(f)&&b(a,c,f.replace(/-(.)/g,function(a,b){return b.toUpperCase()}))}}function d(b,c,d){if("initial"==c||"initial"==d){var g=b.replace(/-(.)/g,function(a,b){return b.toUpperCase()});"initial"==c&&(c=f[g]),"initial"==d&&(d=f[g])}for(var h=c==d?[]:e[b],i=0;h&&i<h.length;i++){var j=h[i][0](c),k=h[i][0](d);if(void 0!==j&&void 0!==k){var l=h[i][1](j,k);if(l){var m=a.Interpolation.apply(null,l);return function(a){return 0==a?c:1==a?d:m(a)}}}}return a.Interpolation(!1,!0,function(a){return a?d:c})}var e={};a.addPropertiesHandler=c;var f={backgroundColor:"transparent",backgroundPosition:"0% 0%",borderBottomColor:"currentColor",borderBottomLeftRadius:"0px",borderBottomRightRadius:"0px",borderBottomWidth:"3px",borderLeftColor:"currentColor",borderLeftWidth:"3px",borderRightColor:"currentColor",borderRightWidth:"3px",borderSpacing:"2px",borderTopColor:"currentColor",borderTopLeftRadius:"0px",borderTopRightRadius:"0px",borderTopWidth:"3px",bottom:"auto",clip:"rect(0px, 0px, 0px, 0px)",color:"black",fontSize:"100%",fontWeight:"400",height:"auto",left:"auto",letterSpacing:"normal",lineHeight:"120%",marginBottom:"0px",marginLeft:"0px",marginRight:"0px",marginTop:"0px",maxHeight:"none",maxWidth:"none",minHeight:"0px",minWidth:"0px",opacity:"1.0",outlineColor:"invert",outlineOffset:"0px",outlineWidth:"3px",paddingBottom:"0px",paddingLeft:"0px",paddingRight:"0px",paddingTop:"0px",right:"auto",textIndent:"0px",textShadow:"0px 0px 0px transparent",top:"auto",transform:"",verticalAlign:"0px",visibility:"visible",width:"auto",wordSpacing:"normal",zIndex:"auto"};a.propertyInterpolation=d}(d,f),function(a,b){function c(b){var c=a.calculateActiveDuration(b),d=function(d){return a.calculateTimeFraction(c,d,b)};return d._totalDuration=b.delay+c+b.endDelay,d._isCurrent=function(d){var e=a.calculatePhase(c,d,b);return e===PhaseActive||e===PhaseBefore},d}b.KeyframeEffect=function(d,e,f){var g,h=c(a.normalizeTimingInput(f)),i=b.convertEffectInput(e),j=function(){i(d,g)};return j._update=function(a){return g=h(a),null!==g},j._clear=function(){i(d,null)},j._hasSameTarget=function(a){return d===a},j._isCurrent=h._isCurrent,j._totalDuration=h._totalDuration,j},b.NullEffect=function(a){var b=function(){a&&(a(),a=null)};return b._update=function(){return null},b._totalDuration=0,b._isCurrent=function(){return!1},b._hasSameTarget=function(){return!1},b}}(c,d,f),function(a){function b(a,b,c){c.enumerable=!0,c.configurable=!0,Object.defineProperty(a,b,c)}function c(a){this._surrogateStyle=document.createElementNS("http://www.w3.org/1999/xhtml","div").style,this._style=a.style,this._length=0,this._isAnimatedProperty={};for(var b=0;b<this._style.length;b++){var c=this._style[b];this._surrogateStyle[c]=this._style[c]}this._updateIndices()}function d(a){if(!a._webAnimationsPatchedStyle){var d=new c(a);try{b(a,"style",{get:function(){return d}})}catch(e){a.style._set=function(b,c){a.style[b]=c},a.style._clear=function(b){a.style[b]=""}}a._webAnimationsPatchedStyle=a.style}}var e={cssText:1,length:1,parentRule:1},f={getPropertyCSSValue:1,getPropertyPriority:1,getPropertyValue:1,item:1,removeProperty:1,setProperty:1},g={removeProperty:1,setProperty:1};c.prototype={get cssText(){return this._surrogateStyle.cssText},set cssText(a){for(var b={},c=0;c<this._surrogateStyle.length;c++)b[this._surrogateStyle[c]]=!0;this._surrogateStyle.cssText=a,this._updateIndices();for(var c=0;c<this._surrogateStyle.length;c++)b[this._surrogateStyle[c]]=!0;for(var d in b)this._isAnimatedProperty[d]||this._style.setProperty(d,this._surrogateStyle.getPropertyValue(d))},get length(){return this._surrogateStyle.length},get parentRule(){return this._style.parentRule},_updateIndices:function(){for(;this._length<this._surrogateStyle.length;)Object.defineProperty(this,this._length,{configurable:!0,enumerable:!1,get:function(a){return function(){return this._surrogateStyle[a]}}(this._length)}),this._length++;for(;this._length>this._surrogateStyle.length;)this._length--,Object.defineProperty(this,this._length,{configurable:!0,enumerable:!1,value:void 0})},_set:function(a,b){this._style[a]=b,this._isAnimatedProperty[a]=!0},_clear:function(a){this._style[a]=this._surrogateStyle[a],delete this._isAnimatedProperty[a]}};for(var h in f)c.prototype[h]=function(a,b){return function(){var c=this._surrogateStyle[a].apply(this._surrogateStyle,arguments);return b&&(this._isAnimatedProperty[arguments[0]]||this._style[a].apply(this._style,arguments),this._updateIndices()),c}}(h,h in g);for(var i in document.documentElement.style)i in e||i in f||!function(a){b(c.prototype,a,{get:function(){return this._surrogateStyle[a]},set:function(b){this._surrogateStyle[a]=b,this._updateIndices(),this._isAnimatedProperty[a]||(this._style[a]=b)}})}(i);a.apply=function(b,c,e){d(b),b.style._set(a.propertyName(c),e)},a.clear=function(b,c){b._webAnimationsPatchedStyle&&b.style._clear(a.propertyName(c))}}(d,f),function(a){window.Element.prototype.animate=function(b,c){return a.timeline._play(a.KeyframeEffect(this,b,c))}}(d),function(a){function b(a,c,d){if("number"==typeof a&&"number"==typeof c)return a*(1-d)+c*d;if("boolean"==typeof a&&"boolean"==typeof c)return.5>d?a:c;if(a.length==c.length){for(var e=[],f=0;f<a.length;f++)e.push(b(a[f],c[f],d));return e}throw"Mismatched interpolation arguments "+a+":"+c}a.Interpolation=function(a,c,d){return function(e){return d(b(a,c,e))}}}(d,f),function(a){function b(a,b,c){return Math.max(Math.min(a,c),b)}function c(c,d,e){var f=a.dot(c,d);f=b(f,-1,1);var g=[];if(1===f)g=c;else for(var h=Math.acos(f),i=1*Math.sin(e*h)/Math.sqrt(1-f*f),j=0;4>j;j++)g.push(c[j]*(Math.cos(e*h)-f*i)+d[j]*i);return g}var d=function(){function a(a,b){for(var c=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],d=0;4>d;d++)for(var e=0;4>e;e++)for(var f=0;4>f;f++)c[d][e]+=b[d][f]*a[f][e];return c}function b(a){return 0==a[0][2]&&0==a[0][3]&&0==a[1][2]&&0==a[1][3]&&0==a[2][0]&&0==a[2][1]&&1==a[2][2]&&0==a[2][3]&&0==a[3][2]&&1==a[3][3]}function c(c,d,e,f,g){for(var h=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],i=0;4>i;i++)h[i][3]=g[i];for(var i=0;3>i;i++)for(var j=0;3>j;j++)h[3][i]+=c[j]*h[j][i];var k=f[0],l=f[1],m=f[2],n=f[3],o=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];o[0][0]=1-2*(l*l+m*m),o[0][1]=2*(k*l-m*n),o[0][2]=2*(k*m+l*n),o[1][0]=2*(k*l+m*n),o[1][1]=1-2*(k*k+m*m),o[1][2]=2*(l*m-k*n),o[2][0]=2*(k*m-l*n),o[2][1]=2*(l*m+k*n),o[2][2]=1-2*(k*k+l*l),h=a(h,o);var p=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];e[2]&&(p[2][1]=e[2],h=a(h,p)),e[1]&&(p[2][1]=0,p[2][0]=e[0],h=a(h,p)),e[0]&&(p[2][0]=0,p[1][0]=e[0],h=a(h,p));for(var i=0;3>i;i++)for(var j=0;3>j;j++)h[i][j]*=d[i];return b(h)?[h[0][0],h[0][1],h[1][0],h[1][1],h[3][0],h[3][1]]:h[0].concat(h[1],h[2],h[3])}return c}();a.composeMatrix=d,a.quat=c}(d,f),function(a,b){a.sequenceNumber=0;var c=function(a,b,c){this.target=a,this.currentTime=b,this.timelineTime=c,this.type="finish",this.bubbles=!1,this.cancelable=!1,this.currentTarget=a,this.defaultPrevented=!1,this.eventPhase=Event.AT_TARGET,this.timeStamp=Date.now()};b.Animation=function(b){this._sequenceNumber=a.sequenceNumber++,this._currentTime=0,this._startTime=null,this._paused=!1,this._playbackRate=1,this._inTimeline=!0,this._finishedFlag=!1,this.onfinish=null,this._finishHandlers=[],this._effect=b,this._inEffect=this._effect._update(0),this._idle=!0,this._currentTimePending=!1},b.Animation.prototype={_ensureAlive:function(){this._inEffect=this._effect._update(this.playbackRate<0&&0===this.currentTime?-1:this.currentTime),this._inTimeline||!this._inEffect&&this._finishedFlag||(this._inTimeline=!0,b.timeline._animations.push(this))},_tickCurrentTime:function(a,b){a!=this._currentTime&&(this._currentTime=a,this._isFinished&&!b&&(this._currentTime=this._playbackRate>0?this._totalDuration:0),this._ensureAlive())},get currentTime(){return this._idle||this._currentTimePending?null:this._currentTime},set currentTime(a){a=+a,isNaN(a)||(b.restart(),this._paused||null==this._startTime||(this._startTime=this._timeline.currentTime-a/this._playbackRate),this._currentTimePending=!1,this._currentTime!=a&&(this._tickCurrentTime(a,!0),b.invalidateEffects()))},get startTime(){return this._startTime},set startTime(a){a=+a,isNaN(a)||this._paused||this._idle||(this._startTime=a,this._tickCurrentTime((this._timeline.currentTime-this._startTime)*this.playbackRate),b.invalidateEffects())},get playbackRate(){return this._playbackRate},set playbackRate(a){if(a!=this._playbackRate){var b=this.currentTime;this._playbackRate=a,this._startTime=null,"paused"!=this.playState&&"idle"!=this.playState&&this.play(),null!=b&&(this.currentTime=b)}},get _isFinished(){return!this._idle&&(this._playbackRate>0&&this._currentTime>=this._totalDuration||this._playbackRate<0&&this._currentTime<=0)},get _totalDuration(){return this._effect._totalDuration},get playState(){return this._idle?"idle":null==this._startTime&&!this._paused&&0!=this.playbackRate||this._currentTimePending?"pending":this._paused?"paused":this._isFinished?"finished":"running"},play:function(){this._paused=!1,(this._isFinished||this._idle)&&(this._currentTime=this._playbackRate>0?0:this._totalDuration,this._startTime=null,b.invalidateEffects()),this._finishedFlag=!1,b.restart(),this._idle=!1,this._ensureAlive()},pause:function(){this._isFinished||this._paused||this._idle||(this._currentTimePending=!0),this._startTime=null,this._paused=!0},finish:function(){this._idle||(this.currentTime=this._playbackRate>0?this._totalDuration:0,this._startTime=this._totalDuration-this.currentTime,this._currentTimePending=!1)},cancel:function(){this._inEffect&&(this._inEffect=!1,this._idle=!0,this.currentTime=0,this._startTime=null,this._effect._update(null),b.invalidateEffects(),b.restart())},reverse:function(){this.playbackRate*=-1,this.play()},addEventListener:function(a,b){"function"==typeof b&&"finish"==a&&this._finishHandlers.push(b)},removeEventListener:function(a,b){if("finish"==a){var c=this._finishHandlers.indexOf(b);c>=0&&this._finishHandlers.splice(c,1)}},_fireEvents:function(a){var b=this._isFinished;if((b||this._idle)&&!this._finishedFlag){var d=new c(this,this._currentTime,a),e=this._finishHandlers.concat(this.onfinish?[this.onfinish]:[]);setTimeout(function(){e.forEach(function(a){a.call(d.target,d)})},0)}this._finishedFlag=b},_tick:function(a){return this._idle||this._paused||(null==this._startTime?this.startTime=a-this._currentTime/this.playbackRate:this._isFinished||this._tickCurrentTime((a-this._startTime)*this.playbackRate)),this._currentTimePending=!1,this._fireEvents(a),!this._idle&&(this._inEffect||!this._finishedFlag)}}}(c,d,f),function(a,b){function c(a){var b=i;i=[],a<s.currentTime&&(a=s.currentTime),g(a),b.forEach(function(b){b[1](a)}),o&&g(a),f(),l=void 0}function d(a,b){return a._sequenceNumber-b._sequenceNumber}function e(){this._animations=[],this.currentTime=window.performance&&performance.now?performance.now():0}function f(){p.forEach(function(a){a()}),p.length=0}function g(a){n=!1;var c=b.timeline;c.currentTime=a,c._animations.sort(d),m=!1;var e=c._animations;c._animations=[];var f=[],g=[];e=e.filter(function(b){return b._inTimeline=b._tick(a),b._inEffect?g.push(b._effect):f.push(b._effect),b._isFinished||b._paused||b._idle||(m=!0),b._inTimeline}),p.push.apply(p,f),p.push.apply(p,g),c._animations.push.apply(c._animations,e),o=!1,m&&requestAnimationFrame(function(){})}var h=window.requestAnimationFrame,i=[],j=0;window.requestAnimationFrame=function(a){var b=j++;return 0==i.length&&h(c),i.push([b,a]),b},window.cancelAnimationFrame=function(a){i.forEach(function(b){b[0]==a&&(b[1]=function(){})})},e.prototype={_play:function(c){c._timing=a.normalizeTimingInput(c.timing);var d=new b.Animation(c);return d._idle=!1,d._timeline=this,this._animations.push(d),b.restart(),b.invalidateEffects(),d}};var k,l=void 0,k=function(){return void 0==l&&(l=performance.now()),l},m=!1,n=!1;b.restart=function(){return m||(m=!0,requestAnimationFrame(function(){}),n=!0),n};var o=!1;b.invalidateEffects=function(){o=!0};var p=[],q=1e3/60,r=window.getComputedStyle;Object.defineProperty(window,"getComputedStyle",{configurable:!0,enumerable:!0,value:function(){if(o){var a=k();a-s.currentTime>0&&(s.currentTime+=q*(Math.floor((a-s.currentTime)/q)+1)),g(s.currentTime)}return f(),r.apply(this,arguments)}});var s=new e;b.timeline=s}(c,d,f),function(a){function b(a,b){for(var c=0,d=0;d<a.length;d++)c+=a[d]*b[d];return c}function c(a,b){return[a[0]*b[0]+a[4]*b[1]+a[8]*b[2]+a[12]*b[3],a[1]*b[0]+a[5]*b[1]+a[9]*b[2]+a[13]*b[3],a[2]*b[0]+a[6]*b[1]+a[10]*b[2]+a[14]*b[3],a[3]*b[0]+a[7]*b[1]+a[11]*b[2]+a[15]*b[3],a[0]*b[4]+a[4]*b[5]+a[8]*b[6]+a[12]*b[7],a[1]*b[4]+a[5]*b[5]+a[9]*b[6]+a[13]*b[7],a[2]*b[4]+a[6]*b[5]+a[10]*b[6]+a[14]*b[7],a[3]*b[4]+a[7]*b[5]+a[11]*b[6]+a[15]*b[7],a[0]*b[8]+a[4]*b[9]+a[8]*b[10]+a[12]*b[11],a[1]*b[8]+a[5]*b[9]+a[9]*b[10]+a[13]*b[11],a[2]*b[8]+a[6]*b[9]+a[10]*b[10]+a[14]*b[11],a[3]*b[8]+a[7]*b[9]+a[11]*b[10]+a[15]*b[11],a[0]*b[12]+a[4]*b[13]+a[8]*b[14]+a[12]*b[15],a[1]*b[12]+a[5]*b[13]+a[9]*b[14]+a[13]*b[15],a[2]*b[12]+a[6]*b[13]+a[10]*b[14]+a[14]*b[15],a[3]*b[12]+a[7]*b[13]+a[11]*b[14]+a[15]*b[15]]}function d(a){switch(a.t){case"rotatex":var b=a.d[0].rad||0,c=a.d[0].deg||0,d=c*Math.PI/180+b;return[1,0,0,0,0,Math.cos(d),Math.sin(d),0,0,-Math.sin(d),Math.cos(d),0,0,0,0,1];case"rotatey":var b=a.d[0].rad||0,c=a.d[0].deg||0,d=c*Math.PI/180+b;return[Math.cos(d),0,-Math.sin(d),0,0,1,0,0,Math.sin(d),0,Math.cos(d),0,0,0,0,1];case"rotate":case"rotatez":var b=a.d[0].rad||0,c=a.d[0].deg||0,d=c*Math.PI/180+b;return[Math.cos(d),Math.sin(d),0,0,-Math.sin(d),Math.cos(d),0,0,0,0,1,0,0,0,0,1];case"rotate3d":var e=a.d[0],f=a.d[1],g=a.d[2],b=a.d[3].rad||0,c=a.d[3].deg||0,d=c*Math.PI/180+b,h=e*e+f*f+g*g;if(0===h)e=1,f=0,g=0;else if(1!==h){var i=Math.sqrt(h);e/=i,f/=i,g/=i}var j=Math.sin(d/2),k=j*Math.cos(d/2),l=j*j;return[1-2*(f*f+g*g)*l,2*(e*f*l+g*k),2*(e*g*l-f*k),0,2*(e*f*l-g*k),1-2*(e*e+g*g)*l,2*(f*g*l+e*k),0,2*(e*g*l+f*k),2*(f*g*l-e*k),1-2*(e*e+f*f)*l,0,0,0,0,1];case"scale":return[a.d[0],0,0,0,0,a.d[1],0,0,0,0,1,0,0,0,0,1];case"scalex":return[a.d[0],0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];case"scaley":return[1,0,0,0,0,a.d[0],0,0,0,0,1,0,0,0,0,1];case"scalez":return[1,0,0,0,0,1,0,0,0,0,a.d[0],0,0,0,0,1];case"scale3d":return[a.d[0],0,0,0,0,a.d[1],0,0,0,0,a.d[2],0,0,0,0,1];case"skew":var m=a.d[0].deg||0,n=a.d[0].rad||0,o=a.d[1].deg||0,p=a.d[1].rad||0,q=m*Math.PI/180+n,r=o*Math.PI/180+p;return[1,Math.tan(r),0,0,Math.tan(q),1,0,0,0,0,1,0,0,0,0,1];case"skewx":var b=a.d[0].rad||0,c=a.d[0].deg||0,d=c*Math.PI/180+b;return[1,0,0,0,Math.tan(d),1,0,0,0,0,1,0,0,0,0,1];case"skewy":var b=a.d[0].rad||0,c=a.d[0].deg||0,d=c*Math.PI/180+b;return[1,Math.tan(d),0,0,0,1,0,0,0,0,1,0,0,0,0,1];case"translate":var e=a.d[0].px||0,f=a.d[1].px||0;return[1,0,0,0,0,1,0,0,0,0,1,0,e,f,0,1];case"translatex":var e=a.d[0].px||0;return[1,0,0,0,0,1,0,0,0,0,1,0,e,0,0,1];case"translatey":var f=a.d[0].px||0;return[1,0,0,0,0,1,0,0,0,0,1,0,0,f,0,1];case"translatez":var g=a.d[0].px||0;return[1,0,0,0,0,1,0,0,0,0,1,0,0,0,g,1];case"translate3d":var e=a.d[0].px||0,f=a.d[1].px||0,g=a.d[2].px||0;return[1,0,0,0,0,1,0,0,0,0,1,0,e,f,g,1];case"perspective":var s=a.d[0].px?-1/a.d[0].px:0;return[1,0,0,0,0,1,0,0,0,0,1,s,0,0,0,1];case"matrix":return[a.d[0],a.d[1],0,0,a.d[2],a.d[3],0,0,0,0,1,0,a.d[4],a.d[5],0,1];case"matrix3d":return a.d}}function e(a){return 0===a.length?[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]:a.map(d).reduce(c)}function f(a){return[g(e(a))]}var g=function(){function a(a){return a[0][0]*a[1][1]*a[2][2]+a[1][0]*a[2][1]*a[0][2]+a[2][0]*a[0][1]*a[1][2]-a[0][2]*a[1][1]*a[2][0]-a[1][2]*a[2][1]*a[0][0]-a[2][2]*a[0][1]*a[1][0]}function c(b){for(var c=1/a(b),d=b[0][0],e=b[0][1],f=b[0][2],g=b[1][0],h=b[1][1],i=b[1][2],j=b[2][0],k=b[2][1],l=b[2][2],m=[[(h*l-i*k)*c,(f*k-e*l)*c,(e*i-f*h)*c,0],[(i*j-g*l)*c,(d*l-f*j)*c,(f*g-d*i)*c,0],[(g*k-h*j)*c,(j*e-d*k)*c,(d*h-e*g)*c,0]],n=[],o=0;3>o;o++){for(var p=0,q=0;3>q;q++)p+=b[3][q]*m[q][o];n.push(p)}return n.push(1),m.push(n),m}function d(a){return[[a[0][0],a[1][0],a[2][0],a[3][0]],[a[0][1],a[1][1],a[2][1],a[3][1]],[a[0][2],a[1][2],a[2][2],a[3][2]],[a[0][3],a[1][3],a[2][3],a[3][3]]]}function e(a,b){for(var c=[],d=0;4>d;d++){for(var e=0,f=0;4>f;f++)e+=a[f]*b[f][d];c.push(e)}return c}function f(a){var b=g(a);return[a[0]/b,a[1]/b,a[2]/b]}function g(a){return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])}function h(a,b,c,d){return[c*a[0]+d*b[0],c*a[1]+d*b[1],c*a[2]+d*b[2]]}function i(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function j(j){var k=[j.slice(0,4),j.slice(4,8),j.slice(8,12),j.slice(12,16)];if(1!==k[3][3])return null;for(var l=[],m=0;4>m;m++)l.push(k[m].slice());for(var m=0;3>m;m++)l[m][3]=0;if(0===a(l))return!1;var n,o=[];if(k[0][3]||k[1][3]||k[2][3]){o.push(k[0][3]),o.push(k[1][3]),o.push(k[2][3]),o.push(k[3][3]);var p=c(l),q=d(p);n=e(o,q)}else n=[0,0,0,1];var r=k[3].slice(0,3),s=[];s.push(k[0].slice(0,3));var t=[];t.push(g(s[0])),s[0]=f(s[0]);var u=[];s.push(k[1].slice(0,3)),u.push(b(s[0],s[1])),s[1]=h(s[1],s[0],1,-u[0]),t.push(g(s[1])),s[1]=f(s[1]),u[0]/=t[1],s.push(k[2].slice(0,3)),u.push(b(s[0],s[2])),s[2]=h(s[2],s[0],1,-u[1]),u.push(b(s[1],s[2])),s[2]=h(s[2],s[1],1,-u[2]),t.push(g(s[2])),s[2]=f(s[2]),u[1]/=t[2],u[2]/=t[2];var v=i(s[1],s[2]);if(b(s[0],v)<0)for(var m=0;3>m;m++)t[m]*=-1,s[m][0]*=-1,s[m][1]*=-1,s[m][2]*=-1;var w,x,y=s[0][0]+s[1][1]+s[2][2]+1;return y>1e-4?(w=.5/Math.sqrt(y),x=[(s[2][1]-s[1][2])*w,(s[0][2]-s[2][0])*w,(s[1][0]-s[0][1])*w,.25/w]):s[0][0]>s[1][1]&&s[0][0]>s[2][2]?(w=2*Math.sqrt(1+s[0][0]-s[1][1]-s[2][2]),x=[.25*w,(s[0][1]+s[1][0])/w,(s[0][2]+s[2][0])/w,(s[2][1]-s[1][2])/w]):s[1][1]>s[2][2]?(w=2*Math.sqrt(1+s[1][1]-s[0][0]-s[2][2]),x=[(s[0][1]+s[1][0])/w,.25*w,(s[1][2]+s[2][1])/w,(s[0][2]-s[2][0])/w]):(w=2*Math.sqrt(1+s[2][2]-s[0][0]-s[1][1]),x=[(s[0][2]+s[2][0])/w,(s[1][2]+s[2][1])/w,.25*w,(s[1][0]-s[0][1])/w]),[r,t,u,x,n]}return j}();a.dot=b,a.makeMatrixDecomposition=f}(d,f),function(a){function b(a,b){var c=a.exec(b);return c?(c=a.ignoreCase?c[0].toLowerCase():c[0],[c,b.substr(c.length)]):void 0}function c(a,b){b=b.replace(/^\s*/,"");var c=a(b);return c?[c[0],c[1].replace(/^\s*/,"")]:void 0}function d(a,d,e){a=c.bind(null,a);for(var f=[];;){var g=a(e);if(!g)return[f,e];if(f.push(g[0]),e=g[1],g=b(d,e),!g||""==g[1])return[f,e];e=g[1]}}function e(a,b){for(var c=0,d=0;d<b.length&&(!/\s|,/.test(b[d])||0!=c);d++)if("("==b[d])c++;else if(")"==b[d]&&(c--,0==c&&d++,0>=c))break;var e=a(b.substr(0,d));return void 0==e?void 0:[e,b.substr(d)]}function f(a,b){for(var c=a,d=b;c&&d;)c>d?c%=d:d%=c;return c=a*b/(c+d)}function g(a){return function(b){var c=a(b);return c&&(c[0]=void 0),c}}function h(a,b){return function(c){var d=a(c);return d?d:[b,c]}}function i(b,c){for(var d=[],e=0;e<b.length;e++){var f=a.consumeTrimmed(b[e],c);if(!f||""==f[0])return;void 0!==f[0]&&d.push(f[0]),c=f[1]}return""==c?d:void 0}function j(a,b,c,d,e){for(var g=[],h=[],i=[],j=f(d.length,e.length),k=0;j>k;k++){var l=b(d[k%d.length],e[k%e.length]);if(!l)return;g.push(l[0]),h.push(l[1]),i.push(l[2])}return[g,h,function(b){var d=b.map(function(a,b){return i[b](a)}).join(c);return a?a(d):d}]}function k(a,b,c){for(var d=[],e=[],f=[],g=0,h=0;h<c.length;h++)if("function"==typeof c[h]){var i=c[h](a[g],b[g++]);d.push(i[0]),e.push(i[1]),f.push(i[2])}else!function(a){d.push(!1),e.push(!1),f.push(function(){return c[a]})}(h);return[d,e,function(a){for(var b="",c=0;c<a.length;c++)b+=f[c](a[c]);return b}]}a.consumeToken=b,a.consumeTrimmed=c,a.consumeRepeated=d,a.consumeParenthesised=e,a.ignore=g,a.optional=h,a.consumeList=i,a.mergeNestedRepeated=j.bind(null,null),a.mergeWrappedNestedRepeated=j,a.mergeList=k}(d),function(a){function b(b){function c(b){var c=a.consumeToken(/^inset/i,b);if(c)return d.inset=!0,c;var c=a.consumeLengthOrPercent(b);if(c)return d.lengths.push(c[0]),c;var c=a.consumeColor(b);return c?(d.color=c[0],c):void 0}var d={inset:!1,lengths:[],color:null},e=a.consumeRepeated(c,/^/,b);return e&&e[0].length?[d,e[1]]:void 0}function c(c){var d=a.consumeRepeated(b,/^,/,c);return d&&""==d[1]?d[0]:void 0}function d(b,c){for(;b.lengths.length<Math.max(b.lengths.length,c.lengths.length);)b.lengths.push({px:0});for(;c.lengths.length<Math.max(b.lengths.length,c.lengths.length);)c.lengths.push({px:0});if(b.inset==c.inset&&!!b.color==!!c.color){for(var d,e=[],f=[[],0],g=[[],0],h=0;h<b.lengths.length;h++){var i=a.mergeDimensions(b.lengths[h],c.lengths[h],2==h);f[0].push(i[0]),g[0].push(i[1]),e.push(i[2])}if(b.color&&c.color){var j=a.mergeColors(b.color,c.color);f[1]=j[0],g[1]=j[1],d=j[2]}return[f,g,function(a){for(var c=b.inset?"inset ":" ",f=0;f<e.length;f++)c+=e[f](a[0][f])+" ";return d&&(c+=d(a[1])),c}]}}function e(b,c,d,e){function f(a){return{inset:a,color:[0,0,0,0],lengths:[{px:0},{px:0},{px:0},{px:0}]}}for(var g=[],h=[],i=0;i<d.length||i<e.length;i++){var j=d[i]||f(e[i].inset),k=e[i]||f(d[i].inset);g.push(j),h.push(k)}return a.mergeNestedRepeated(b,c,g,h)}var f=e.bind(null,d,", ");a.addPropertiesHandler(c,f,["box-shadow","text-shadow"])}(d),function(a){function b(a){return a.toFixed(3).replace(".000","")}function c(a,b,c){return Math.min(b,Math.max(a,c))}function d(a){return/^\s*[-+]?(\d*\.)?\d+\s*$/.test(a)?Number(a):void 0}function e(a,c){return[a,c,b]}function f(a,b){return 0!=a?h(0,1/0)(a,b):void 0}function g(a,b){return[a,b,function(a){return Math.round(c(1,1/0,a))}]}function h(a,d){return function(e,f){return[e,f,function(e){return b(c(a,d,e))}]}}function i(a,b){return[a,b,Math.round]}a.clamp=c,a.addPropertiesHandler(d,h(0,1/0),["border-image-width","line-height"]),a.addPropertiesHandler(d,h(0,1),["opacity","shape-image-threshold"]),a.addPropertiesHandler(d,f,["flex-grow","flex-shrink"]),a.addPropertiesHandler(d,g,["orphans","widows"]),a.addPropertiesHandler(d,i,["z-index"]),a.parseNumber=d,a.mergeNumbers=e,a.numberToString=b}(d,f),function(a){function b(a,b){return"visible"==a||"visible"==b?[0,1,function(c){return 0>=c?a:c>=1?b:"visible"}]:void 0}a.addPropertiesHandler(String,b,["visibility"])}(d),function(a){function b(a){a=a.trim(),e.fillStyle="#000",e.fillStyle=a;var b=e.fillStyle;if(e.fillStyle="#fff",e.fillStyle=a,b==e.fillStyle){e.fillRect(0,0,1,1);var c=e.getImageData(0,0,1,1).data;e.clearRect(0,0,1,1);var d=c[3]/255;return[c[0]*d,c[1]*d,c[2]*d,d]}}function c(b,c){return[b,c,function(b){function c(a){return Math.max(0,Math.min(255,a))}if(b[3])for(var d=0;3>d;d++)b[d]=Math.round(c(b[d]/b[3]));return b[3]=a.numberToString(a.clamp(0,1,b[3])),"rgba("+b.join(",")+")"}]}var d=document.createElementNS("http://www.w3.org/1999/xhtml","canvas");d.width=d.height=1;var e=d.getContext("2d");a.addPropertiesHandler(b,c,["background-color","border-bottom-color","border-left-color","border-right-color","border-top-color","color","outline-color","text-decoration-color"]),a.consumeColor=a.consumeParenthesised.bind(null,b),a.mergeColors=c
}(d,f),function(a,b){function c(a,b){if(b=b.trim().toLowerCase(),"0"==b&&"px".search(a)>=0)return{px:0};if(/^[^(]*$|^calc/.test(b)){b=b.replace(/calc\(/g,"(");var c={};b=b.replace(a,function(a){return c[a]=null,"U"+a});for(var d="U("+a.source+")",e=b.replace(/[-+]?(\d*\.)?\d+/g,"N").replace(new RegExp("N"+d,"g"),"D").replace(/\s[+-]\s/g,"O").replace(/\s/g,""),f=[/N\*(D)/g,/(N|D)[*/]N/g,/(N|D)O\1/g,/\((N|D)\)/g],g=0;g<f.length;)f[g].test(e)?(e=e.replace(f[g],"$1"),g=0):g++;if("D"==e){for(var h in c){var i=eval(b.replace(new RegExp("U"+h,"g"),"").replace(new RegExp(d,"g"),"*0"));if(!isFinite(i))return;c[h]=i}return c}}}function d(a,b){return e(a,b,!0)}function e(b,c,d){var e,f=[];for(e in b)f.push(e);for(e in c)f.indexOf(e)<0&&f.push(e);return b=f.map(function(a){return b[a]||0}),c=f.map(function(a){return c[a]||0}),[b,c,function(b){var c=b.map(function(c,e){return 1==b.length&&d&&(c=Math.max(c,0)),a.numberToString(c)+f[e]}).join(" + ");return b.length>1?"calc("+c+")":c}]}var f="px|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc",g=c.bind(null,new RegExp(f,"g")),h=c.bind(null,new RegExp(f+"|%","g")),i=c.bind(null,/deg|rad|grad|turn/g);a.parseLength=g,a.parseLengthOrPercent=h,a.consumeLengthOrPercent=a.consumeParenthesised.bind(null,h),a.parseAngle=i,a.mergeDimensions=e;var j=a.consumeParenthesised.bind(null,g),k=a.consumeRepeated.bind(void 0,j,/^/),l=a.consumeRepeated.bind(void 0,k,/^,/);a.consumeSizePairList=l;var m=function(a){var b=l(a);return b&&""==b[1]?b[0]:void 0},n=a.mergeNestedRepeated.bind(void 0,d," "),o=a.mergeNestedRepeated.bind(void 0,n,",");a.mergeNonNegativeSizePair=n,a.addPropertiesHandler(m,o,["background-size"]),a.addPropertiesHandler(h,d,["border-bottom-width","border-image-width","border-left-width","border-right-width","border-top-width","flex-basis","font-size","height","line-height","max-height","max-width","outline-width","width"]),a.addPropertiesHandler(h,e,["border-bottom-left-radius","border-bottom-right-radius","border-top-left-radius","border-top-right-radius","bottom","left","letter-spacing","margin-bottom","margin-left","margin-right","margin-top","min-height","min-width","outline-offset","padding-bottom","padding-left","padding-right","padding-top","perspective","right","shape-margin","text-indent","top","vertical-align","word-spacing"])}(d,f),function(a){function b(b){return a.consumeLengthOrPercent(b)||a.consumeToken(/^auto/,b)}function c(c){var d=a.consumeList([a.ignore(a.consumeToken.bind(null,/^rect/)),a.ignore(a.consumeToken.bind(null,/^\(/)),a.consumeRepeated.bind(null,b,/^,/),a.ignore(a.consumeToken.bind(null,/^\)/))],c);return d&&4==d[0].length?d[0]:void 0}function d(b,c){return"auto"==b||"auto"==c?[!0,!1,function(d){var e=d?b:c;if("auto"==e)return"auto";var f=a.mergeDimensions(e,e);return f[2](f[0])}]:a.mergeDimensions(b,c)}function e(a){return"rect("+a+")"}var f=a.mergeWrappedNestedRepeated.bind(null,e,d,", ");a.parseBox=c,a.mergeBoxes=f,a.addPropertiesHandler(c,f,["clip"])}(d,f),function(a){function b(a){return function(b){var c=0;return a.map(function(a){return a===j?b[c++]:a})}}function c(a){return a}function d(b){if(b=b.toLowerCase().trim(),"none"==b)return[];for(var c,d=/\s*(\w+)\(([^)]*)\)/g,e=[],f=0;c=d.exec(b);){if(c.index!=f)return;f=c.index+c[0].length;var g=c[1],h=m[g];if(!h)return;var i=c[2].split(","),j=h[0];if(j.length<i.length)return;for(var n=[],o=0;o<j.length;o++){var p,q=i[o],r=j[o];if(p=q?{A:function(b){return"0"==b.trim()?l:a.parseAngle(b)},N:a.parseNumber,T:a.parseLengthOrPercent,L:a.parseLength}[r.toUpperCase()](q):{a:l,n:n[0],t:k}[r],void 0===p)return;n.push(p)}if(e.push({t:g,d:n}),d.lastIndex==b.length)return e}}function e(a){return a.toFixed(6).replace(".000000","")}function f(b,c){if(b.decompositionPair!==c){b.decompositionPair=c;var d=a.makeMatrixDecomposition(b)}if(c.decompositionPair!==b){c.decompositionPair=b;var f=a.makeMatrixDecomposition(c)}return null==d[0]||null==f[0]?[[!1],[!0],function(a){return a?c[0].d:b[0].d}]:(d[0].push(0),f[0].push(1),[d,f,function(b){var c=a.quat(d[0][3],f[0][3],b[5]),g=a.composeMatrix(b[0],b[1],b[2],c,b[4]),h=g.map(e).join(",");return h}])}function g(a){return a.replace(/[xy]/,"")}function h(a){return a.replace(/(x|y|z|3d)?$/,"3d")}function i(b,c){var d=a.makeMatrixDecomposition&&!0,e=!1;if(!b.length||!c.length){b.length||(e=!0,b=c,c=[]);for(var i=0;i<b.length;i++){var j=b[i].t,k=b[i].d,l="scale"==j.substr(0,5)?1:0;c.push({t:j,d:k.map(function(a){if("number"==typeof a)return l;var b={};for(var c in a)b[c]=l;return b})})}}var n=function(a,b){return"perspective"==a&&"perspective"==b||("matrix"==a||"matrix3d"==a)&&("matrix"==b||"matrix3d"==b)},o=[],p=[],q=[];if(b.length!=c.length){if(!d)return;var r=f(b,c);o=[r[0]],p=[r[1]],q=[["matrix",[r[2]]]]}else for(var i=0;i<b.length;i++){var j,s=b[i].t,t=c[i].t,u=b[i].d,v=c[i].d,w=m[s],x=m[t];if(n(s,t)){if(!d)return;var r=f([b[i]],[c[i]]);o.push(r[0]),p.push(r[1]),q.push(["matrix",[r[2]]])}else{if(s==t)j=s;else if(w[2]&&x[2]&&g(s)==g(t))j=g(s),u=w[2](u),v=x[2](v);else{if(!w[1]||!x[1]||h(s)!=h(t)){if(!d)return;var r=f(b,c);o=[r[0]],p=[r[1]],q=[["matrix",[r[2]]]];break}j=h(s),u=w[1](u),v=x[1](v)}for(var y=[],z=[],A=[],B=0;B<u.length;B++){var C="number"==typeof u[B]?a.mergeNumbers:a.mergeDimensions,r=C(u[B],v[B]);y[B]=r[0],z[B]=r[1],A.push(r[2])}o.push(y),p.push(z),q.push([j,A])}}if(e){var D=o;o=p,p=D}return[o,p,function(a){return a.map(function(a,b){var c=a.map(function(a,c){return q[b][1][c](a)}).join(",");return"matrix"==q[b][0]&&16==c.split(",").length&&(q[b][0]="matrix3d"),q[b][0]+"("+c+")"}).join(" ")}]}var j=null,k={px:0},l={deg:0},m={matrix:["NNNNNN",[j,j,0,0,j,j,0,0,0,0,1,0,j,j,0,1],c],matrix3d:["NNNNNNNNNNNNNNNN",c],rotate:["A"],rotatex:["A"],rotatey:["A"],rotatez:["A"],rotate3d:["NNNA"],perspective:["L"],scale:["Nn",b([j,j,1]),c],scalex:["N",b([j,1,1]),b([j,1])],scaley:["N",b([1,j,1]),b([1,j])],scalez:["N",b([1,1,j])],scale3d:["NNN",c],skew:["Aa",null,c],skewx:["A",null,b([j,l])],skewy:["A",null,b([l,j])],translate:["Tt",b([j,j,k]),c],translatex:["T",b([j,k,k]),b([j,k])],translatey:["T",b([k,j,k]),b([k,j])],translatez:["L",b([k,k,j])],translate3d:["TTL",c]};a.addPropertiesHandler(d,i,["transform"])}(d,f),function(a){function b(a){var b=Number(a);return isNaN(b)||100>b||b>900||b%100!==0?void 0:b}function c(b){return b=100*Math.round(b/100),b=a.clamp(100,900,b),400===b?"normal":700===b?"bold":String(b)}function d(a,b){return[a,b,c]}a.addPropertiesHandler(b,d,["font-weight"])}(d),function(a){function b(a){var b={};for(var c in a)b[c]=-a[c];return b}function c(b){return a.consumeToken(/^(left|center|right|top|bottom)\b/i,b)||a.consumeLengthOrPercent(b)}function d(b,d){var e=a.consumeRepeated(c,/^/,d);if(e&&""==e[1]){var f=e[0];if(f[0]=f[0]||"center",f[1]=f[1]||"center",3==b&&(f[2]=f[2]||{px:0}),f.length==b){if(/top|bottom/.test(f[0])||/left|right/.test(f[1])){var h=f[0];f[0]=f[1],f[1]=h}if(/left|right|center|Object/.test(f[0])&&/top|bottom|center|Object/.test(f[1]))return f.map(function(a){return"object"==typeof a?a:g[a]})}}}function e(d){var e=a.consumeRepeated(c,/^/,d);if(e){for(var f=e[0],h=[{"%":50},{"%":50}],i=0,j=!1,k=0;k<f.length;k++){var l=f[k];"string"==typeof l?(j=/bottom|right/.test(l),i={left:0,right:0,center:i,top:1,bottom:1}[l],h[i]=g[l],"center"==l&&i++):(j&&(l=b(l),l["%"]=(l["%"]||0)+100),h[i]=l,i++,j=!1)}return[h,e[1]]}}function f(b){var c=a.consumeRepeated(e,/^,/,b);return c&&""==c[1]?c[0]:void 0}var g={left:{"%":0},center:{"%":50},right:{"%":100},top:{"%":0},bottom:{"%":100}},h=a.mergeNestedRepeated.bind(null,a.mergeDimensions," ");a.addPropertiesHandler(d.bind(null,3),h,["transform-origin"]),a.addPropertiesHandler(d.bind(null,2),h,["perspective-origin"]),a.consumePosition=e,a.mergeOffsetList=h;var i=a.mergeNestedRepeated.bind(null,h,", ");a.addPropertiesHandler(f,i,["background-position","object-position"])}(d),function(a){function b(b){var c=a.consumeToken(/^circle/,b);if(c&&c[0])return["circle"].concat(a.consumeList([a.ignore(a.consumeToken.bind(void 0,/^\(/)),d,a.ignore(a.consumeToken.bind(void 0,/^at/)),a.consumePosition,a.ignore(a.consumeToken.bind(void 0,/^\)/))],c[1]));var f=a.consumeToken(/^ellipse/,b);if(f&&f[0])return["ellipse"].concat(a.consumeList([a.ignore(a.consumeToken.bind(void 0,/^\(/)),e,a.ignore(a.consumeToken.bind(void 0,/^at/)),a.consumePosition,a.ignore(a.consumeToken.bind(void 0,/^\)/))],f[1]));var g=a.consumeToken(/^polygon/,b);return g&&g[0]?["polygon"].concat(a.consumeList([a.ignore(a.consumeToken.bind(void 0,/^\(/)),a.optional(a.consumeToken.bind(void 0,/^nonzero\s*,|^evenodd\s*,/),"nonzero,"),a.consumeSizePairList,a.ignore(a.consumeToken.bind(void 0,/^\)/))],g[1])):void 0}function c(b,c){return b[0]===c[0]?"circle"==b[0]?a.mergeList(b.slice(1),c.slice(1),["circle(",a.mergeDimensions," at ",a.mergeOffsetList,")"]):"ellipse"==b[0]?a.mergeList(b.slice(1),c.slice(1),["ellipse(",a.mergeNonNegativeSizePair," at ",a.mergeOffsetList,")"]):"polygon"==b[0]&&b[1]==c[1]?a.mergeList(b.slice(2),c.slice(2),["polygon(",b[1],g,")"]):void 0:void 0}var d=a.consumeParenthesised.bind(null,a.parseLengthOrPercent),e=a.consumeRepeated.bind(void 0,d,/^/),f=a.mergeNestedRepeated.bind(void 0,a.mergeDimensions," "),g=a.mergeNestedRepeated.bind(void 0,f,",");a.addPropertiesHandler(b,c,["shape-outside"])}(d),function(a){function b(a,b){b.concat([a]).forEach(function(b){b in document.documentElement.style&&(c[a]=b)})}var c={};b("transform",["webkitTransform","msTransform"]),b("transformOrigin",["webkitTransformOrigin"]),b("perspective",["webkitPerspective"]),b("perspectiveOrigin",["webkitPerspectiveOrigin"]),a.propertyName=function(a){return c[a]||a}}(d,f)}()}({},function(){return this}());

},{}],6:[function(require,module,exports){
/*===================================================================================
 * Implementation of animations features.
 * This implementation providing usefull way of animations support for javascript. 
 * One of interresting things is animate.css features support.
 *===================================================================================
*/

/**
 * Allow to change images for animations **it’s specialy usefull to simulate a loading**.
 * @class
 * @constructs iJS.mi_loader
 * @param {Object} imgContainer  is an *id* name of a `HTMLImageElement` or represent a `HTMLImageElement`
 * @param {string} imgDir        is a path where are the images to animate
 * @param {number} imgLength     is the number of images to animate
 * @param {string} imgGlobalName is the global name of images to animate. 
 *                               egg: if *imgload* is your given global name, corresponding images names have to be *imgload0*, *imgload1*, *imgload2*, ...
 * @param {string} imgFormat     the format of images. By default it’s *png*.
 */
iJS.mi_loader = function (imgContainer, imgDir, imgLength, imgGlobalName, imgFormat) {

    if (iJS.isString(imgDir))
        this.imgDir = imgDir;
    if (iJS.isNumber(imgLength))
        this.imgLength = imgLength;
    if (iJS.isString(imgGlobalName))
        this.imgGlobalName = imgGlobalName;

    this.imgFormat = (iJS.isString(imgFormat)) ? imgFormat : "png";

    if (iJS.isString(imgContainer))
        if (iJS.isHTMLImageElement(document.getElementById(imgContainer)))
            this.imgContainer = document.getElementById(imgContainer);
        else if (iJS.isHTMLImageElement(imgContainer))
            this.imgContainer = imgContainer;

    this.imgIndex = 0; //represent the image number to show
    this.imgPath = ""; //represent image path to show
    this.loaderID = 0; //for content the identification number of programing events via functions like `setTimeout()`

    /**
     * Allow to change or replace the current showing image by the next one.
     * @function changeIMGLoader
     * @memberof iJS.mi_loader
     * @param {iJS.mi_loader} loader Normaly, it’s the `mi_loader` instance itself, reference by `this`.
     *                               But it can be any other instance of `mi_loader` class.
     *                               It’s just necessary when the function is use like argument to another.
     *@example var miLoader = new iJS.mi_loader(imgContainer, imgDir, imgLength, imgGlobalName, imgFormat);
     *         miLoader.changeIMGLoader(); //the parameter isn’t needed
     *         setTimeout( miLoader.changeIMGLoader, delay, miLoader ); //have to give an instance of `mi_loader` in parameter. Here it’s the object itself.
     *         //the parameter is needed in this case to avoid the using of `window` root object when use the reference `this` in `changeIMGLoader` function.
     */
    this.changeIMGLoader = function (loader) {

        //ld = loader or this **object itself** 
        var ld = (loader instanceof iJS.mi_loader) ? loader : this;

        if (ld.imgDir && ld.imgLength && ld.imgGlobalName)
            if (ld.imgIndex < ld.imgLength) {
                ld.imgPath = ld.imgDir + "/" + ld.imgGlobalName + ld.imgIndex + "." + ld.imgFormat;
                ld.imgIndex++;
            } else {
                ld.imgIndex = 0;
            }


        if (ld.imgContainer)
            ld.imgContainer.src = ld.imgPath;
    }

    /**
     * Allow to start animation by replacing images sucessively according to a given time interval.
     * @function startLoading
     * @memberof iJS.mi_loader
     * @param {number} timeInterval interval of time to change images. By default it’s `150ms`.
     */
    this.startLoading = function (timeInterval) {

        if (this.loaderID) //first stop current animation
            this.stopLoading();

        if (iJS.isNumber(timeInterval))
            this.loaderID = setInterval(this.changeIMGLoader, timeInterval, this)
            else {
                this.loaderID = setInterval(this.changeIMGLoader, 150, this);
            }

    }

    /**
     * Allow to stop animation or images changing.
     * The animation will stop immediatly or after a given time.
     * @function stopLoading
     * @memberof iJS.mi_loader
     * @param {number} time time to stop animation.
     */
    this.stopLoading = function (time) {

        if (iJS.isNumber(time)) {
            setTimeout(function (loader) {
                if (loader instanceof iJS.mi_loader) {
                    clearInterval(loader.loaderID);
                    loader.imgIndex = 0;
                    loader.loaderID = 0;
                    loader.changeIMGLoader();
                }
            }, time, this);
        } else {
            clearInterval(this.loaderID);
            this.imgIndex = 0;
            this.loaderID = 0;
            this.changeIMGLoader();
        }
    }
}


/**
 * Animate an element by using predifined animations styles.
 * Provide support of popuplar <a href="https://github.com/daneden/animate.css">animate.css</a> features.
 * Some animations styles have two way to be selected by its name; for example, `bounceInUp` like in *animate.css* 
 * can also be indicated with `bounce-in-up`, ...
 * @function animate
 * @example //Select the elements to animate and enjoy!
 *     var elt = document.querySelector("#notification") ;
 *     iJS.animate(elt, "shake") ;
 *     //it return an AnimationPlayer object: see **web-animations.js** API for more details.
 *     //animation iteration and duration can also be indicated.
 *     var vivifyElt = iJS.animate(elt, "bounce", 3, 500) ;
 *     vivifyElt.onfinish = function(e) {
 *         //doSomething ...;
 *     }
 *     // less than 1500ms later...changed mind!
 *     vivifyElt.cancel();
 * @param   {Element}         elt        Element to animate.
 * @param   {String}          anime      Animations styles.
 * @param   {Number}          iterations Number of animation's iteration. 1 by default, -1 or "Infinity" for infinite animation.
 * @param   {Number}          time       Duration of the animation. 900ms by default.
 * @returns {AnimationPlayer} An object that can help to control considered animation. 
 *                            See <a href="https://github.com/web-animations">web-animations.js</a> API for more details.
 */
iJS.animate = function (elt, anime, iterations, time) {
    
    if (!iJS.isElement( elt )) {
        if (iJS.isString( elt )) {
            
            elt = document.getElementById( elt ) ;
            if (!elt) return null ;
        
        } else {
            return null ;
        }
    }
    
    if (!iJS.isNumber( time )) time = 900 ;
    if (!iJS.isNumber( iterations ) && iterations !== "Infinity") iterations = 1 ; 
    else if ( iterations == -1) iterations = "Infinity" ;
    if (!iJS.isString( anime )) anime = "_default" ;
    
    var keyframes = [] ,
        timing = {} ;
    
    switch (anime) {
            
        case "bounce":
            keyframes = [
                {transform: 'translate3d(0,0,0)', visibility: 'visible', offset: 0}, 
                {transform: 'translate3d(0,0,0)', offset: 0.2},
                {transform: 'translate3d(0,-30px,0)', offset: 0.4},
                {transform: 'translate3d(0,-30px,0)', offset: 0.43},
                {transform: 'translate3d(0,0,0)', offset: 0.53},
                {transform: 'translate3d(0,-15px,0)', offset: 0.7},
                {transform: 'translate3d(0,0,0)', offset: 0.8},
                {transform: 'translate3d(0,-15px,0)', offset: 0.9},
                {transform: 'translate3d(0,0,0)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)'};
            
            break;
        
        case "bounceIn":
        case "bounce-in":
            elt.style.visibility = 'visible';
             keyframes = [
                 {transform: 'scale3d(.3, .3, .3)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'scale3d(1.1, 1.1, 1.1)', offset: 0.2},
                {transform: 'scale3d(.9, .9, .9)', offset: 0.4},
                 {transform: 'scale3d(1.03, 1.03, 1.03)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'scale3d(.97, .97, .97)', offset: 0.8},
                 {transform: 'scale3d(1, 1, 1)', opacity: '1', visibility: 'visible', offset: 1}
             ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)'};
            
            break;
        
        case "bounceOut":
        case "bounce-out":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'scale3d(.9, .9, .9)', opacity: '1', visibility: 'visible', offset: 0.2},
                {transform: 'scale3d(1.1, 1.1, 1.1)', opacity: '1', visibility: 'visible', offset: 0.5},
                {transform: 'scale3d(1.1, 1.1, 1.1)', opacity: '1', visibility: 'visible', offset: 0.55},
                {transform: 'scale3d(.3, .3, .3)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;
        
        case "bounceInDown":
        case "bounce-in-down":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(0, -3000px, 0)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'translate3d(0, 25px, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'translate3d(0, -100px, 0)', offset: 0.75},
                {transform: 'translate3d(0, 5px, 0)', offset: 0.9},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)'};
            
            break;
            
        case "bounceOutDown":
        case "bounce-out-down":
            elt.style.visibility = 'hidden';
            var transitingTimingFunction = elt.style['transition-timing-function'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'translate3d(0, 50px, 0)', opacity: '1', visibility: 'visible', offset: 0.2},
                {transform: 'translate3d(0, -20px, 0)', opacity: '1', visibility: 'visible', offset: 0.4},
                {transform: 'translate3d(0, -20px, 0)', opacity: '1', visibility: 'visible', offset: 0.45},
                {transform: 'translate3d(0, 2000px, 0)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;   
            
        case "bounceInUp":
        case "bounce-in-up":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(0, 3000px, 0)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'translate3d(0, -25px, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'translate3d(0, 100px, 0)', offset: 0.75},
                {transform: 'translate3d(0, -5px, 0)', offset: 0.9},
                {transform: 'translate3d(0, 0, 0)', opacity: '1', visibility: 'visible', offset: 1}];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)'};
            
            break;  
            
        case "bounceOutUp":
        case "bounce-out-up":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'translate3d(0, 50px, 0)', opacity: '1', visibility: 'visible', offset: 0.2},
                {transform: 'translate3d(0, 20px, 0)', opacity: '1', visibility: 'visible', offset: 0.4},
                {transform: 'translate3d(0, 20px, 0)', opacity: '1', visibility: 'visible', offset: 0.45},
                {transform: 'translate3d(0, -2000px, 0)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;  
            
        case "bounceInLeft":
        case "bounce-in-left":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(-3000px, 0, 0)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'translate3d(25px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'translate3d(-100px, 0, 0)', offset: 0.75},
                {transform: 'translate3d(5px, 0, 0)', offset: 0.9},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)'};
           
            break;     
            
        case "bounceOutLeft":
        case "bounce-out-left":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'translate3d(100px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.2},
                {transform: 'translate3d(-20px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.4},
                {transform: 'translate3d(-20px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.45},
                {transform: 'translate3d(-2000px, 0, 0)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;    
            
        case "bounceInRight":
        case "bounce-in-right":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(3000px, 0, 0)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'translate3d(-25px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                { transform: 'translate3d(100px, 0, 0)', offset: 0.75},
                {transform: 'translate3d(-5px, 0, 0)', offset: 0.9},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)'};
            
            break;   
            
        case "bounceOutRight":
        case "bounce-out-right":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'translate3d(100px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.2},
                {transform: 'translate3d(-20px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.4},
                {transform: 'translate3d(-20px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.45},
                {transform: 'translate3d(2000px, 0, 0)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;    
            
        case "fadeIn":
        case "fade-in":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', offset: 0}, 
                {opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOut":
        case "fade-out":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', offset: 0}, 
                {opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInDown":
        case "fade-in-down":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, -100%, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutDown":
        case "fade-out-down":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0},
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, 100%, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;    

        case "fadeOutUp":
        case "fade-out-up":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0},
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, -100%, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutUpBig":
        case "fade-out-up-big":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0},
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, -2000px, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInUp":
        case "fade-in-up":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, 100%, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInDownBig":
        case "fade-in-down-big":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, -2000px, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutDownBig":
        case "fade-out-down-big":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0},
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, 2000px, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInUpBig":
        case "fade-in-up-big":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(0, 2000px, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInRightBig":
        case "fade-in-right-big":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(2000px, 0, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutLeftBig":
        case "fade-out-left-big":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0}, 
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(-2000px, 0, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInLeft":
        case "fade-in-left":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(-100%, 0, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInLeftBig":
        case "fade-in-left-big":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(-2000px, 0, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeInRight":
        case "fade-in-right":
            elt.style.visibility = 'visible';
            keyframes = [
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(100%, 0, 0)', offset: 0}, 
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutLeft":
        case "fade-out-left":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0}, 
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(-100%, 0, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutRight":
        case "fade-out-right":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0},
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(100%, 0, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "fadeOutRightBig":
        case "fade-out-right-big":
            elt.style.visibility = 'hidden';
            keyframes = [
                {opacity: '1', visibility: 'visible', transform: 'none', offset: 0},
                {opacity: '0', visibility: 'hidden', transform: 'translate3d(2000px, 0, 0)', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
            
        case "flash":
            keyframes = [
                {opacity: '1', visibility: 'visible', offset: 0}, 
                {opacity: '0', offset: 0.25}, 
                {opacity: '1', offset: 0.5}, 
                {opacity: '0', offset: 0.75}, 
                {opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
            
        case "flip":
            keyframes = [
                {transform: 'perspective(400px) rotate3d(0, 1, 0, -360deg)', visibility: 'visible', offset: 0},
                {transform: 'perspective(400px) translate3d(0, 0, 150px) rotate3d(0, 1, 0, -190deg)', offset: 0.4},
                {transform: 'perspective(400px) translate3d(0, 0, 150px) rotate3d(0, 1, 0, -170deg)', offset: 0.5},
                {transform: 'perspective(400px) scale3d(.95, .95, .95)', offset: 0.8},
                {transform: 'perspective(400px)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in'};
           
            break;
            
        case "flipInX":
        case "flip-in-x":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'perspective(400px) rotate3d(1, 0, 0, 90deg)', opacity: '0', visibility: 'hidden', offset: 0},
                {transform: 'perspective(400px) rotate3d(1, 0, 0, -20deg)', offset: 0.4},
                {transform: 'perspective(400px) rotate3d(1, 0, 0, 10deg)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'perspective(400px) rotate3d(1, 0, 0, -5deg)', opacity: '1', visibility: 'visible', offset: 0.8},
                {transform: 'perspective(400px)', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in'};
           
            break;  
                  
        case "flipOutX":
        case "flip-out-x":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'perspective(400px)', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'perspective(400px) rotate3d(1, 0, 0, -20deg)', opacity: '1', visibility: 'visible', offset: 0.3},
                {transform: 'perspective(400px) rotate3d(1, 0, 0, 90deg)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;  
                  
        case "flipInY":
        case "flip-in-y":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'perspective(400px) rotate3d(0, 1, 0, 90deg)', opacity: '0', visibility: 'hidden', offset: 0},
                {transform: 'perspective(400px) rotate3d(0, 1, 0, -20deg)', offset: 0.4},
                {transform: 'perspective(400px) rotate3d(0, 1, 0, 10deg)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'perspective(400px) rotate3d(0, 1, 0, -5deg)', opacity: '1', visibility: 'visible', offset: 0.8},
                {transform: 'perspective(400px)', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in'};
           
            break;  
                  
        case "flipOutY":
        case "flip-out-y":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'perspective(400px)', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'perspective(400px) rotate3d(0, 1, 0, -20deg)', opacity: '1', visibility: 'visible', offset: 0.3},
                {transform: 'perspective(400px) rotate3d(0, 1, 0, 90deg)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
        
        case "hinge":
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, 0deg)', transformOrigin: 'top left', visibility: 'visible', offset: 0}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', offset: 0.2}, 
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', offset: 0.6},
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', offset: 0.8},
                {transform: 'rotate3d(0, 0, 1, 10deg)', transformOrigin: 'top left', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in-out'};

            break; 

        case "hingeIn":
        case "hinge-in":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'translate3d(0, 700px, 0)', transformOrigin: 'top left', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'translate3d(0, 500px, 0)', transformOrigin: 'top left', opacity: '0.4', visibility: 'visible', offset: 0.1}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', opacity: '0.6', offset: 0.2}, 
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', opacity: '0.8', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', opacity: '1', offset: 0.6},
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', offset: 0.8},
                {transform: 'rotate3d(0, 0, 1, 10deg)', transformOrigin: 'top left', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in-out'};

            break; 

        case "hingeOut":
        case "hinge-out":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, 0deg)', transformOrigin: 'top left', opacity: '1', visibility: 'visible', offset: 0}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', offset: 0.2}, 
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', opacity: '0.8', offset: 0.6},
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', opacity: '0.6', offset: 0.8},
                {transform: 'translate3d(0, 700px, 0)', transformOrigin: 'top left', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in-out'};

            break; 
            
        case "jello":
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'skewX(0deg) skewY(0deg)', visibility: 'visible', transformOrigin: 'center', offset: 0}, 
                {transform: 'skewX(-12.5deg) skewY(-12.5deg)', offset: 0.2}, 
                {transform: 'skewX(6.2deg) skewY(6.2deg)', offset: 0.3},
                {transform: 'skewX(-3.1deg) skewY(-3.1deg)', offset: 0.4}, 
                {transform: 'skewX(1.5deg) skewY(1.5deg)', offset: 0.5}, 
                {transform: 'skewX(-0.78deg) skewY(-0.78deg)', offset: 0.6}, 
                {transform: 'skewX(0.39deg) skewY(0.39deg)', offset: 0.7}, 
                {transform: 'skewX(-0.19deg) skewY(-0.19deg)', offset: 0.8}, 
                {transform: 'skewX(0deg) skewY(0deg)', visibility: 'visible', transformOrigin: 'center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break; 
                        
        case "jelloIn":
        case "jello-in":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'skewX(0deg) skewY(0deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'center', offset: 0}, 
                {transform: 'skewX(-12.5deg) skewY(-12.5deg)', opacity: '0.2', visibility: 'visible', offset: 0.2}, 
                {transform: 'skewX(6.2deg) skewY(6.2deg)', opacity: '0.4', offset: 0.3},
                {transform: 'skewX(-3.1deg) skewY(-3.1deg)', opacity: '0.6', offset: 0.4}, 
                {transform: 'skewX(1.5deg) skewY(1.5deg)', opacity: '0.8', offset: 0.5}, 
                {transform: 'skewX(-0.78deg) skewY(-0.78deg)', opacity: '1', offset: 0.6}, 
                {transform: 'skewX(0.39deg) skewY(0.39deg)', offset: 0.7}, 
                {transform: 'skewX(-0.19deg) skewY(-0.19deg)', offset: 0.8}, 
                {transform: 'skewX(0deg) skewY(0deg)', opacity: '1', visibility: 'visible', transformOrigin: 'center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break; 
            
        case "jelloOut":
        case "jello-out":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'skewX(0deg) skewY(0deg)', opacity: '1', visibility: 'visible', transformOrigin: 'center', offset: 0}, 
                {transform: 'skewX(12.5deg) skewY(12.5deg)', opacity: '0.8', offset: 0.2}, 
                {transform: 'skewX(-6.2deg) skewY(-6.2deg)', opacity: '0.7', offset: 0.3},
                {transform: 'skewX(3.1deg) skewY(3.1deg)', opacity: '0.6', offset: 0.4}, 
                {transform: 'skewX(-1.5deg) skewY(-1.5deg)', opacity: '0.5', offset: 0.5}, 
                {transform: 'skewX(0.78deg) skewY(0.78deg)', opacity: '0.4', offset: 0.6}, 
                {transform: 'skewX(-0.39deg) skewY(-0.39deg)', opacity: '0.3', offset: 0.7}, 
                {transform: 'skewX(0.19deg) skewY(0.19deg)', opacity: '0.2', offset: 0.8}, 
                {transform: 'skewX(0deg) skewY(0deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break; 
            
        case "lightSpeed":
        case "lightspeed":
            keyframes = [
                {transform: 'skewX(-30deg)', visibility: 'visible', offset: 0}, 
                {transform: 'skewX(20deg)', offset: 0.6}, 
                {transform: 'skewX(-5deg)', offset: 0.8}, 
                {transform: 'none', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
              
        case "lightSpeedIn":
        case "lightspeed-in":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'skewX(-30deg)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'skewX(20deg)', opacity: '1', visibility: 'visible', offset: 0.6}, 
                {transform: 'skewX(-5deg)', opacity: '1', visibility: 'visible', offset: 0.8}, 
                {transform: 'none', opacity: '1 ', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
        
        case "lightSpeedOut":
        case "lightspeed-out":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1 ', visibility: 'visible', offset: 0}, 
                {transform: 'skewX(30deg)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "lightSpeedInRight":
        case "lightspeed-in-right":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(100%, 0, 0) skewX(-30deg)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'skewX(20deg)', opacity: '1', visibility: 'visible', offset: 0.6}, 
                {transform: 'skewX(-5deg)', opacity: '1', visibility: 'visible', offset: 0.8}, 
                {transform: 'none', opacity: '1 ', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
      
        case "lightSpeedOutRight":
        case "lightspeed-out-right":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1 ', visibility: 'visible', offset: 0}, 
                {transform: 'translate3d(100%, 0, 0) skewX(30deg)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "lightSpeedInLeft":
        case "lightspeed-in-left":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(-100%, 0, 0) skewX(-30deg)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'skewX(20deg)', opacity: '1', visibility: 'visible', offset: 0.6}, 
                {transform: 'skewX(-5deg)', opacity: '1', visibility: 'visible', offset: 0.8}, 
                {transform: 'none', opacity: '1 ', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "lightSpeedOutLeft":
        case "lightspeed-out-left":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1 ', visibility: 'visible', offset: 0}, 
                {transform: 'translate3d(-100%, 0, 0) skewX(30deg)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;
            
        case "overHinge":
        case "overhinge":
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, 0deg)', transformOrigin: 'top left', visibility: 'visible', offset: 0}, 
                {transform: 'rotate3d(0, 0, 1, 80deg)', transformOrigin: 'top left', offset: 0.1}, 
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', offset: 0.3}, 
                {transform: 'rotate3d(0, 0, 1, 160deg)', transformOrigin: 'top left', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, 120deg)', transformOrigin: 'top left', offset: 0.6},
                {transform: 'rotate3d(0, 0, 1, 320deg)', transformOrigin: 'top left', offset: 0.7}, 
                {transform: 'rotate3d(0, 0, 1, 240deg)', transformOrigin: 'top left', offset: 0.8},
                {transform: 'rotate3d(0, 0, 1, 360deg)', transformOrigin: 'top left', visibility: 'visible', offset: 1}
                //{transform: 'translate3d(0, 700px, 0)', transformOrigin: 'top left', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in-out'};

            break; 

        case "overHingeIn":
        case "overhinge-in":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'translate3d(0, 700px, 0)', transformOrigin: 'top left', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'translate3d(0, 500px, 0)', transformOrigin: 'top left', opacity: '0.4', visibility: 'visible', offset: 0.1}, 
                {transform: 'rotate3d(0, 0, 1, 60deg)', transformOrigin: 'top left', opacity: '0.6', offset: 0.3}, 
                {transform: 'rotate3d(0, 0, 1, 160deg)', transformOrigin: 'top left', opacity: '0.8', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, 120deg)', transformOrigin: 'top left', opacity: '0.1', offset: 0.6},
                {transform: 'rotate3d(0, 0, 1, 320deg)', transformOrigin: 'top left', offset: 0.7}, 
                {transform: 'rotate3d(0, 0, 1, 240deg)', transformOrigin: 'top left', offset: 0.8},
                {transform: 'rotate3d(0, 0, 1, 360deg)', transformOrigin: 'top left', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in-out'};

            break; 

        case "overHingeOut":
        case "overhinge-out":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, 0deg)', transformOrigin: 'top left', opacity: '1', visibility: 'visible', offset: 0}, 
                {transform: 'rotate3d(0, 0, 1, -80deg)', transformOrigin: 'top left', offset: 0.1}, 
                {transform: 'rotate3d(0, 0, 1, -60deg)', transformOrigin: 'top left', offset: 0.3}, 
                {transform: 'rotate3d(0, 0, 1, -160deg)', transformOrigin: 'top left', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, -120deg)', transformOrigin: 'top left', offset: 0.6},
                {transform: 'rotate3d(0, 0, 1, -320deg)', transformOrigin: 'top left', opacity: '0.8', offset: 0.7}, 
                {transform: 'rotate3d(0, 0, 1, -240deg)', transformOrigin: 'top left', opacity: '0.6', offset: 0.8},
                {transform: 'translate3d(0, 700px, 0)', transformOrigin: 'top left', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in-out'};

            break; 
                            
        case "pulse":
            keyframes = [
                {transform: 'scale3d(1, 1, 1)', visibility: 'visible', offset: 0}, 
                {transform: 'scale3d(1.05, 1.05, 1.05)', offset: 0.5}, 
                {transform: 'scale3d(1, 1, 1)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;  
                      
        case "rollIn":
        case "roll-in":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(-100%, 0, 0) rotate3d(0, 0, 1, -120deg)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rollOut":
        case "roll-out":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0}, 
                {transform: 'translate3d(100%, 0, 0) rotate3d(0, 0, 1, -120deg)', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
            
        case "rotateIn":
        case "rotate-in":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, -200deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'center', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateInDownLeft":
        case "rotate-in-down-left":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, -45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'left bottom', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'left bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateInDownRight":
        case "rotate-in-down-right":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, 45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'right bottom', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'right bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateInUpLeft":
        case "rotate-in-up-left":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, 45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'left bottom', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'left bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateInUpRight":
        case "rotate-in-up-right":
            elt.style.visibility = 'visible';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'rotate3d(0, 0, 1, -45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'right bottom', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'right bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateOutDownLeft":
        case "rotate-out-down-left":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'left bottom', offset: 0},
                {transform: 'rotate3d(0, 0, 1, 45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'left bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateOutDownRight":
        case "rotate-out-down-right":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'right bottom', offset: 0},
                {transform: 'rotate3d(0, 0, 1, -45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'right bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateOutUpLeft":
        case "rotate-out-up-left":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'left bottom', offset: 0},
                {transform: 'rotate3d(0, 0, 1, -45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'left bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateOutUpRight":
        case "rotate-out-up-right":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'right bottom', offset: 0},
                {transform: 'rotate3d(0, 0, 1, 45deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'right bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  

        case "rotateOut":
        case "rotate-out":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'center', offset: 0}, 
                {transform: 'rotate3d(0, 0, 1, 200deg)', opacity: '0', visibility: 'hidden', transformOrigin: 'center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};

            break;  
            
        case "rubberband":
            keyframes = [
                {transform: 'scale3d(1, 1, 1)', visibility: 'visible', offset: 0}, 
                {transform: 'scale3d(1.25, 0.75, 1)', offset: 0.3}, 
                {transform: 'scale3d(0.75, 1.25, 1)', offset: 0.4}, 
                {transform: 'scale3d(1.15, 0.85, 1)', offset: 0.5}, 
                {transform: 'scale3d(.95, 1.05, 1)', offset: 0.65}, 
                {transform: 'scale3d(1.05, .95, 1)', offset: 0.75}, 
                {transform: 'scale3d(1, 1, 1)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
             
            break;  
                                   
        case "shake":
            keyframes = [
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 0}, 
                {transform: 'translate3d(-10px, 0, 0)', offset: 0.1}, 
                {transform: 'translate3d(10px, 0, 0)', offset: 0.2}, 
                {transform: 'translate3d(-10px, 0, 0)', offset: 0.3}, 
                {transform: 'translate3d(10px, 0, 0)', offset: 0.4}, 
                {transform: 'translate3d(-10px, 0, 0)', offset: 0.5}, 
                {transform: 'translate3d(10px, 0, 0)', offset: 0.6}, 
                {transform: 'translate3d(-10px, 0, 0)', offset: 0.7}, 
                {transform: 'translate3d(10px, 0, 0)', offset: 0.8}, 
                {transform: 'translate3d(-10px, 0, 0)', offset: 0.9}, 
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;   
            
        case "slideInDown":
        case "slide-in-down":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(0, -100%, 0)', visibility: 'hidden', offset: 0},  
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
        
        case "slideInLeft":
        case "slide-in-left":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(-100%, 0, 0)', visibility: 'hidden', offset: 0},  
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;  
            
        case "slideInRight":
        case "slide-in-right":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(100%, 0, 0)', visibility: 'hidden', offset: 0},  
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
             
        case "slideInUp":
        case "slide-in-up":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'translate3d(0, 100%, 0)', visibility: 'hidden', offset: 0},  
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
                 
        case "slideOutDown":
        case "slide-out-down":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 0},  
                {transform: 'translate3d(0, 100%, 0)', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
        
        case "slideOutLeft":
        case "slide-out-left":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 0},  
                {transform: 'translate3d(-100%, 0, 0)', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;  
            
        case "slideOutRight":
        case "slide-out-right":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 0},  
                {transform: 'translate3d(100%, 0, 0)', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
             
        case "slideOutUp":
        case "slide-out-up":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'translate3d(0, 0, 0)', visibility: 'visible', offset: 0},  
                {transform: 'translate3d(0, -100%, 0)', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break; 
        
        case "squiggle":
            keyframes = [
                {transform: 'scaleX(0.7) scaleY(0) translate(0,-100%)', opacity: '0', visibility: 'visible', offset: 0}, 
                {transform: 'scaleX(1.5) scaleY(1) translate(0,0%)', opacity: '0.3', offset: 0.1}, 
                {transform: 'scaleX(0.8) scaleY(1) translate(0%,-20%)', opacity: '0.6', offset: 0.2}, 
                {transform: 'scaleX(1.3) scaleY(1) translate(0%,0%)', opacity: '0.7', offset: 0.35}, 
                {transform: 'scaleX(0.9) scaleY(1) translate(0%,-5%)', opacity: '0.8', offset: 0.5}, 
                {transform: 'scaleX(1.1) scaleY(1) translate(0%,0%)', opacity: '0.9', offset: 0.7},
                {transform: 'scaleX(1) scaleY(1) translate(0%,0%)', opacity: '1', offset: 0.9},
                {transform: 'inherit', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'ease-in'};
            
            break;   
                    
        case "swing":
            keyframes = [
                {transform: 'translate(0%)', visibility: 'visible', offset: 0}, 
                {transform: 'rotate3d(0, 0, 1, 15deg)', offset: 0.2}, 
                {transform: 'rotate3d(0, 0, 1, -10deg)', offset: 0.4}, 
                {transform: 'rotate3d(0, 0, 1, 5deg)', offset: 0.6}, 
                {transform: 'rotate3d(0, 0, 1, -5deg)', offset: 0.8}, 
                {transform: 'rotate3d(0, 0, 1, 0deg)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;   
            
        case "tada":
            keyframes = [
                {transform: 'scale3d(1, 1, 1)', visibility: 'visible', offset: 0}, 
                {transform: 'scale3d(.9, .9, .9) rotate3d(0, 0, 1, -3deg)', offset: 0.1}, 
                {transform: 'scale3d(.9, .9, .9) rotate3d(0, 0, 1, -3deg)', offset: 0.2}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)', offset: 0.3}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, -3deg)', offset: 0.4}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)', offset: 0.5}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, -3deg)', offset: 0.6}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)', offset: 0.7}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, -3deg)', offset: 0.8}, 
                {transform: 'scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)', offset: 0.9}, 
                {transform: 'scale3d(1, 1, 1)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;     
            
        case "wobble":
            keyframes = [
                {transform: 'translate(0%)', visibility: 'visible', offset: 0}, 
                {transform: 'translate3d(20%, 0, 0) rotate3d(0, 0, 1, 3deg)', offset: 0.15}, 
                {transform: 'translate3d(-15%, 0, 0) rotate3d(0, 0, 1, -3deg)', offset: 0.45}, 
                {transform: 'translate3d(10%, 0, 0) rotate3d(0, 0, 1, 2deg)', offset: 0.6}, 
                {transform: 'translate3d(-5%, 0, 0) rotate3d(0, 0, 1, -1deg)', offset: 0.75}, 
                {transform: 'translateX(0%)', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;  
                                             
        case "zoomIn":
        case "zoom-in":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'scale3d(.3, .3, .3)  ', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
             
            break;  
                                                 
        case "zoomOutDown":
        case "zoom-out-down":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'center bottom', offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(0, -60px, 0)', opacity: '1', visibility: 'visible',  transformOrigin: 'center bottom', offset: 0.4},
                {transform: 'scale3d(.1, .1, .1) translate3d(0, 2000px, 0)', opacity: '0', visibility: 'hidden', transformOrigin: 'center bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
            
            break;  
                                                 
        case "zoomOutUp":
        case "zoom-out-up":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'center bottom', offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(0, 60px, 0)', opacity: '1', visibility: 'visible',  transformOrigin: 'center bottom', offset: 0.4},
                {transform: 'scale3d(.1, .1, .1) translate3d(0, -2000px, 0)', opacity: '0', visibility: 'hidden', transformOrigin: 'center bottom', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
            
            break;  
                                                 
        case "zoomOutRight":
        case "zoom-out-right":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'right center', offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(-42px, 0, 0)', opacity: '1', visibility: 'visible',  transformOrigin: 'right center', offset: 0.4},
                {transform: 'scale(.1) translate3d(2000px, 0, 0)', opacity: '0', visibility: 'hidden', transformOrigin: 'right center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
              
            break;  
                                                 
        case "zoomOutLeft":
        case "zoom-out-left":
            elt.style.visibility = 'hidden';
            var transformOrigin = elt.style['transform-origin'];
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', transformOrigin: 'left center', offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(42px, 0, 0)', opacity: '1',  transformOrigin: 'left center', offset: 0.4},
                {transform: 'scale(.1) translate3d(-2000px, 0, 0)', opacity: '0', visibility: 'hidden', transformOrigin: 'left center', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
             
            break;  
                                                      
        case "zoomInDown":
        case "zoom-in-down":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'scale3d(.1, .1, .1) translate3d(0, -1000px, 0)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(0, 60px, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
           
            break;  
                                                      
        case "zoomInLeft":
        case "zoom-in-left":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'scale3d(.1, .1, .1) translate3d(-1000px, 0, 0)', opacity: '0', visibility: 'hidden', offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(10px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
           
            break;  
                                                      
        case "zoomInRight":
        case "zoom-in-right":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'scale3d(.1, .1, .1) translate3d(1000px, 0, 0)', opacity: '0', visibility: 'hidden',  offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(-10px, 0, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
            
            break;  
                                                      
        case "zoomInUp":
        case "zoom-in-up":
            elt.style.visibility = 'visible';
            keyframes = [
                {transform: 'scale3d(.1, .1, .1) translate3d(0, 1000px, 0)', opacity: '0', visibility: 'hidden',  offset: 0}, 
                {transform: 'scale3d(.475, .475, .475) translate3d(0, -60px, 0)', opacity: '1', visibility: 'visible', offset: 0.6},
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations, easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)'};
            
            break;  
                                                          
        case "zoomOut":
        case "zoom-out":
            elt.style.visibility = 'hidden';
            keyframes = [
                {transform: 'none', opacity: '1', visibility: 'visible', offset: 0},
                {transform: 'scale3d(.3, .3, .3)  ', opacity: '0', visibility: 'hidden', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;  
            
        default:
            console.warn('iJS-animate: unknown animation "'+anime+'"') ;
            
            keyframes = [
                {opacity: '0', visibility: 'visible', offset: 0},
                {opacity: '1', visibility: 'visible', offset: 1}
            ];
            timing = {duration: time, iterations: iterations};
            
            break;
    }
    
    return elt.animate( keyframes, timing) ;

}


/* Here is where the animations dependencies are included. 
 * iJS animations features requires **web-animations.js** library.
 * Some browser like *chrome* or webkit's base applications implement it.
 * However, on waiting of its full support, it's more efficient to prevent non full support by directly use the library.
 * Therefore, user who have to use that, do not have to include it again when he use *iJS*.
 _______________________________________________________________________________________________________________________
 */
require('web-animations-js') ;


},{"web-animations-js":5}],7:[function(require,module,exports){
/* "iJS"(pour "inside JS") initiée ici est une mini bibliothèque pour le développement en JavaScript des projets associés. 
 * Le but n’est pas de refaire ce que des grandes bibliothèques telles que **Jquery**, **mootools**, AngularJS** et autres font assez bien, mais de fournir soit des fonctionnalités en plus ou soit une meilleur approche pour une certaine facilité.
 * Cette bibliothèque se veut être legère, indépendante et fonctionnelle. Elle peut donc être utilisable dans n’importe quel projet développé en JavaScript.
 *__________________________________________________________________________________________________________________________________________________________
 */
/*
 * This library is firstly build for UMI web’s projects and for pure JavaScript development.
 * However it can be use for any JavaScript projects.
 * 
 * @license LGPL v2.1 or later
 * @author  [Tindo Ngoufo Arsel](mailto:devtnga@gmail.com)
 * @version 0.99.7_15.11 
*/


//"use strict";

//manage possible conflict in iJS namespace definition.
if ( typeof iJS !== "undefined" ) {
    
    console.warn("Seem like `iJS` namespace is use for another purpose. Taking risk of an overwrite ...") ;
    window.iJS = iJS = {} ;
    console.warn("Forcing iJS namespace initialization ... done.") ;
    
} else {
    
    window.iJS = {} ;
}

/**   
 * This name space provide some functionalities that facilitate JavaScript development of the associated projects.
 * 
 * @namespace iJS
 */

iJS = {
    
    /**
     *@property {string} version Inform about the version of library that is use.
     */
    version: "0.99.7_15.11 ",
    
    /**
     * Let you know if a value or a variable is type of Number or not.
     * @function isNumber
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isNumber: function (arg) {

        return ((typeof arg).toLowerCase() === "number" || arg instanceof Number);
    },

    /**
     * Let you know if a value or a variable is type of Boolean or not.
     * @function isBoolean
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isBoolean: function (arg) {

        return ((typeof arg).toLowerCase() === "boolean" || arg instanceof Boolean);
    },

    /**
     * Let you know if a value or a variable is type of String or not.
     * @function isString
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isString: function (arg) {

        return ((typeof arg).toLowerCase() === "string" || arg instanceof String);
    },
    
    /**
     * Let you know if a value’s suite or a variable is type of Array or not.
     * @function isArray
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isArray: function (arg) {

        return (arg instanceof Array);
    },

    /**
     * Let you know if a variable is type of Element or not.
     * @function isElement
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isElement: function (arg) {

        return (arg instanceof Element);
    },
   
   /**
     * Let you know if a variable is type of HTMLElement or not.
     * @function isHTMLElement
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
   isHTMLElement: function (arg) {

      return (arg instanceof HTMLElement);
   },

    /**
     * Let you know if a variable is type of HTMLImageElement or not.
     * @function isHTMLImageElement
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isHTMLImageElement: function (arg) {

        return (arg instanceof HTMLImageElement);
    },
    
    /**
     * Let you know if a variable is type of HTMLLinkElement or not.
     * @function isHTMLLinkElement
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isHTMLLinkElement: function (arg) {

        return (arg instanceof HTMLLinkElement);
    },

   /**
     * Let you know if a variable is type of HTMLInputElement or not.
     * @function isHTMLInputElement
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isHTMLInputElement: function (arg) {

        return (arg instanceof HTMLInputElement);
    },

    /**
     * Let you know if a variable is type of Object or not.
     * @function isObject
     * @param   {all}     arg argument of test.
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isObject: function (arg) {

        return ((typeof arg).toLowerCase() === "object");
    },
    
    /**
     * Let you know if a value or a variable is valid or not.
     * ie: if an object is `null` or `undefined`.
     * @function isSet
     * @param   {all} arg object to evaluate
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isSet: function (arg) {
        
        return ( (arg !== undefined) && (arg != null) ) ; 
    },
    
    /**
     * Let you know if a variable is defined or not.
     * ie: if an object is not `undefined`.
     * @function isDefined
     * @param   {all} arg object to evaluate
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isDefined: function (arg) {
      
        return (arg !== undefined) ;
    },
    
    /**
     * Let you know if a variable is undefined or not.
     * ie: if an object is not defined.
     * @function isUndefined
     * @param   {all} arg object to evaluate
     * @returns {boolean} true if it is, false if it isn’t.
     */
    isUndefined: function (arg) {
      
        return (arg === undefined) ;
    },
    
    /**
     * clear a string by deleting space at the beginning and at the end.
     * @function stringClear
     * @param   {String} arg a string to clear
     * @returns {String} null or the formatted string
     */
    stringClear: function (arg) {
      
        var str = iJS.isString(arg) ? arg : null ;
        
        if (str) {
            
            var tabChar = str.split('') ;

            for( var i = 0 ; i < tabChar.length && tabChar[i] == ' ' ; i++) {
                
                tabChar.shift() ;
                --i ;
            }
            for( var i = (tabChar.length - 1) ; i >= 0 && tabChar[i] == ' ' ; i--) {
                
                tabChar.pop() ;
            }
            
            str = tabChar.join('') ;
        }

        return str ;
    },

    /**
     * Set the `textContent` of an element without worry about browser’s support.
     * @function setTextContent
     * @param {HTMLElement}   arg  Element to set the text’s content
     * @param {String} text Text that will be used
     */
    setTextContent: function (arg, text) {

        if (iJS.isHTMLElement(arg) && iJS.isDefined(text)) {

            if (arg.textContent) arg.textContent = ''+text ;
            if (arg.innerText) arg.innerText = ''+text ;
        }

    },

    /**
     * Get the `textContent` of an element without worry about browser’s support.
     * @function getTextContent
     * @param   {HTMLElement}   arg  Element to get the text content
     * @returns {String} the text content, empty string if can not be got or `null` if the element is not a *HTMLElement*.
     */
    getTextContent: function (arg) {

       return iJS.isHTMLElement(arg) || iJS.isElement(arg) ? arg.textContent || arg.innerText || '' : null ;
    },

    /**
     * Get the coordonnate of an element relative to document.
     * @function getXY
     * @param   {Object} arg a `HTMLElement` or a `id` of an element
     * @returns {Object} coordonnate `{x:x, y:y}`
     * @example var eltPos = iJS.getXY( HTMLElt ) ;
     *          alert( eltPos.x ) ;
     *          alert( eltPos.y ) ;
     */
    getXY: function (arg) {

        if (iJS.isString(arg)) arg = document.getElementById( arg ) ;
        if (! iJS.isHTMLElement(arg)) return null ;

        var x=0, y=0 ;

        while (iJS.isSet(arg)) {

            x += arg.offsetLeft - arg.scrollLeft ;
            y += arg.offsetTop - arg.scrollTop ;
            arg = arg.offsetParent;
        }

        return {x:x, y:y} ;
    },

    /**
     * Get the coordonnate of an element relative to window.
     * @function getPageXY
     * @param   {Object} arg a `HTMLElement` or a `id` of an element
     * @returns {Object} coordonnate `{x:x, y:y}`
     * @example var eltScrollPos = iJS.getPageXY( HTMLElt ) ;
     *          alert( eltScrollPos.x ) ;
     *          alert( eltScrollPos.y ) ;
     */
    getPageXY : function (arg) {

        if (iJS.isString(arg)) arg = document.getElementById( arg ) ;

        var x=0, y=0 ;

        if ( arg === window || arg === document || arg === document.documentElement ) {

            x = window.pageXOffset ? window.pageXOffset : document.documentElement.scrollLeft ;
            y = window.pageYOffset ? window.pageYOffset : document.documentElement.scrollTop ;

        } else if (! iJS.isHTMLElement(arg)) {
            return null ;

        } else {

            x = window.pageXOffset ? iJS.getXY( arg ).x - window.pageXOffset : iJS.getXY( arg ).x - document.documentElement.scrollLeft ;
            y = window.pageYOffset ? iJS.getXY( arg ).y - window.pageYOffset : iJS.getXY( arg ).y - document.documentElement.scrollTop ;
        }

        return {x:x, y:y} ;
    },

    /**
     * Easily create compatible Ajax XMLHttpResquest object, depending of web browsers support.
     * @function newHTTPRequest
     * @returns {XMLHttpRequest} new instance of `XMLHttpRequest` class.
     */
    newHTTPRequest: function () {
        
        var xhr = null ;

        if (window.XMLHttpRequest) {
            
            xhr = new XMLHttpRequest(); //For Chrome, Firefox, Opera and others...
            
            if (xhr.overrideMimeType)
                xhr.overrideMimeType("text/xml"); //Avoid Safari’s bug
        }
        else if (window.ActiveXObject) {
            //For Internet Explorer
            try {
                xhr = new ActiveXObject("Msxml2.XMLHTTP");  
            } catch (e1) {
                try {
                    xhr = new ActiveXObject("Microsoft.XMLHTTP");  
                } catch (e2) {
                    console.warn( e1.message );
                    console.warn( e2.message );
                }
            }
        }else {
            console.error("iJS:'newHTTPRequest': Can’t init Ajax functionalities. Maybe it’s your browser version?");
        }
        
        return xhr;
    }

};


/* Here is where the animations dependencies are included. 
 * iJS animations features requires **web-animations.js** library.
 * Some browser like *chrome* or webkit's base applications implement it.
 * However, on waiting of its full support, it's more efficient to prevent non full support by directly use the library.
 * Therefore, user who have to use that, do not have to include it again when he use *iJS*.
 _______________________________________________________________________________________________________________________
 */
iJS.Buffer = require('buffer/').Buffer ;

},{"buffer/":1}],8:[function(require,module,exports){
/*=================================================================================================================================================
 * Pure Javascript implementation of Uniforum message translation.
 * This implementation of GNU Gettext, providing internationalization support for javascript. 
 * It differs from existing javascript implementations in that it will support all current Gettext features 
 *(ex. plural and context support), and will also support loading language catalogs from .mo, .po, or preprocessed json files (converter included).
 * It use this [2008 - Javascript Gettext](https://sourceforge.net/projects/jsgettext.berlios/?source=navbar)
 * Thank to [Joshua I. Miller](mailto:unrtst@cpan.org) for that great work.
 *=================================================================================================================================================

-   The following methods are kept in:

  textdomain  (domain)
  gettext     (msgid)
  dgettext    (domainname, msgid)
  dcgettext   (domainname, msgid, LC_MESSAGES)
  ngettext    (msgid, msgid_plural, count)
  dngettext   (domainname, msgid, msgid_plural, count)
  dcngettext  (domainname, msgid, msgid_plural, count, LC_MESSAGES)
  pgettext    (msgctxt, msgid)
  dpgettext   (domainname, msgctxt, msgid)
  dcpgettext  (domainname, msgctxt, msgid, LC_MESSAGES)
  npgettext   (msgctxt, msgid, msgid_plural, count)
  dnpgettext  (domainname, msgctxt, msgid, msgid_plural, count)
  dcnpgettext (domainname, msgctxt, msgid, msgid_plural, count, LC_MESSAGES)
  strargs     (string, args_array)

-   The following methods are removed

    get_lang_refs (link)
    isValidOject  ()
    isArray       (Object)

-   The following methods are completely rewritten

    new Gettext   ()
    try_load_lang ()

-   The following methods are added

    setlocale                 (locale)
    bindtextdomaine           (domain, path_to_locale, type)
    try_load_alternative_lang (domain, link)
    try_load_mo (data) //not yet ready @TODO put available when it will ready
    parse_mo (data) //not yet ready @TODO put available when it will ready
    parseHeader (data) //not yet ready @TODO put available when it will ready

-   Some other modifications are done for changes and updates

The implementation of this library have been made to be more convenient with GNU Gettext references.
In addition, no only "po" or "mo" files can be use to content the messages data, but also "json" files or objects.

This has been tested on the following browsers. It may work on others, but these are all those to which I have access.
    FF1.5, FF2, FF3, IE6, IE7, Opera9, Opera10, Safari3.1, Chrome
    *FF = Firefox
    *IE = Internet Explorer

SEE ALSO
--------
po2json (included),
docs/index.html,
test/
Locale::gettext_pp(3pm), POSIX(3pm), gettext(1), gettext(3)

*/

/**
 * Javascript implemenation of GNU Gettext API.
 * @class
 * @constructs iJS.Gettext
 * @returns {iJS.Gettext}
 * @example
 * //create new instance
 * var igt = new iJS.Gettext() ;
 * //set the locale in which the messages have to be translated.
 * igt.setlocale("fr_FR.utf8") ; // local can also be *fr_FR* or *fr*.
 * //Supposing that most users now have browser that support Ajax;
 * //also add or register a domain where to get the messages data.
 * igt.bindtextdomain("mydomain", "./path_to_locale", "po") ; //"po" can also be "json" or by default "mo".
 * //Always do this after a `setlocale` or a `bindtextdomain` call.
 * igt.try_load_lang() ; //will load and parse messages data from the setting catalog.
 * //Then print your messages
 * alert( igt.gettext("Hello world!") ) ;
 * 
 * //Like with GNU gettext, your domain path have to be
 * // path_to_locale/LC_MESSAGES/fr_FR.utf8/mydomain.po
 * // if "fr_FR.utf8" is not found, "fr_FR" or "fr" will be use for replacement.
 * //This is just an overview. See tutoriels for more.
 * 
 * //Optimum caching way to add domain is to use *<script>* tag to load it via *iJS.Gettext*’s json like file.
 * //just do this to add or register a domain where to get the messages data.
 * igt.locale_data = external_locale_data ;
 * igt.bindtextdomain("json-domain") ; //domain can be any domain in *external_locale_date*
 * /* Supposing that this declaration have be done:`<SCRIPT language="javascript" src="path_to/gettext_json_file"></SCRIPT>`
 *  * and the gettext_json_file content structurate object like:
 *  external_locale_data = {
        "json-domain" : {
            // po header fields
            "" : {
                "plural-forms" : "...",
                "lang" : "en",
                },
            // all the msgid strings and translations
            "msgid" : [ "msgid_plural", "translation", "plural_translation" ],
            "msgctxt\004msgid" : [ null, "msgstr" ],
         },
     "AnotherDomain" : {
         },
    };
  */
iJS.Gettext = function () {

    this.domain = 'messages';
    this.domain_registry = [] ; // will content all the indicated domain and associated paths
    // locale_data will be populated when will `try_load_lang`
    this.locale_data = undefined;
    this.locale_format = null; // will indicate how the locale name is formatted
    this.locale = null;

    return this;
}

/**
 * @property {iJS.Gettext} i18n  Defined `Gettext` object, to make *iJS gettext* functionalities to be directly use.
 * @example 
 * //set the locale in which the messages will be translated
 * iJS.i18n.setlocale("en_US.utf8") ;
 * //add domain where to find messages data
 * iJS.i18n.bindtextdomain("domain_po", "./path_to_locale", "po") ;
 * //add another domain where to find messages data
 * iJS.i18n.bindtextdomain("domain_json", "./path_to_locale", "json") ;
 * //Always do this after a `setlocale` or a `bindtextdomain` call.
 * iJS.i18n.try_load_lang() ; //will load and parse messages data from the setting catalog.
 * //set the current domain
 * iJS.i18n.textdomain("domain_po") ;
 * //now print your messages
 * alert( iJS.i18n.gettext("messages to be translated") ) ;
 */
iJS.i18n = new iJS.Gettext() ;

/**
 * Easily translate your messages when use `Gettext` functionalities.<BR/>
 * Same as you call `iJS.i18n.gettext()`. See documentation of associated terms for more informations.
 * @global
 * @param   {String} msgid  message to be translated
 * @returns {String} translated message if is found or `msgid` if not.
 * @example 
 * //set the locale in which the messages will be translated
 * iJS.i18n.setlocale("en_US.utf8") ;
 * //add domain where to find messages data
 * iJS.i18n.bindtextdomain("domain_po", "./path_to_locale", "po") ;
 * iJS.i18n.try_load_lang() ; //will load and parse messages data from the setting catalog.
 * //now print your messages
 * alert( iJS._("messages to be translated") ) ;
 */
iJS._ = function (msgid) {

    return iJS.i18n.gettext( msgid ) ;
}

/**
 * Set the locale in which the messages have to be translated.
 * @memberof iJS.Gettext
 * @param {String} locale egg: "en", "en_US.utf8", "en_GB" ...
 */
iJS.Gettext.prototype.setlocale = function (locale) {

    if (iJS.isString( locale )) {

        if (/^.._..\./.test( locale )) {
            this.locale_format = 2 ; //egg: *en_US.utf8*

        } else if (/^.._..$/.test( locale )) {
            this.locale_format = 1 ; //egg: *en_US*

        } else if (/^..$/.test( locale )) {
            this.locale_format = 0 ; //egg: *en*

        } else {
            this.locale_format = -1 ; //egg: *french*
            console.warn("iJS-gettext:'setlocale': It seem like locale: *"+locale+"* do not conform to the **i18n standard format**.") ;
        }

        this.locale = locale ;
        //alert(this.locale)
    } else {
        throw new Error("iJS-gettext:'setlocale': Invalid argument: *"+locale+"* have to be a `string`.") ;
    }
};

/**
 * Add or register a domain where to get the messages data
 * @memberof iJS.Gettext
 * @param {string} domain     The Gettext domain, not www.whatev.com. If the .po file was "myapp.po", this would be "myapp".
 * @param {string} localePath Path to the locale directory where to find the domain. <BR/>
 *                            <U>egg:</U> "./locale" in which we can have ".locale/LC_MESSAGES/fr_FR.utf8/domain.po". <BR/>
 *                            If omitted, it will mean that domain will be considered in a json Object or file.
 *                            See tutorials for more explanation.
 * @param {string} dtype      Type of domain file. Supported files are "po", "json" and "mo"(support is planned).
 *                            If omitted, the default value will be "mo".
 */
iJS.Gettext.prototype.bindtextdomain = function (domain, localePath, dtype) {

    var new_domain, new_locale_path, new_dtype ;

    if (iJS.isString( domain )) {
        new_domain = domain ;

    } else {
        throw new Error("iJS-gettext:'bindtextdomain': a *domaine* have to be defined as argument.") ;
    }

    if (iJS.isString( dtype )){

        if ( dtype == "mo" || dtype == "po" || dtype == "json" ) {
            new_dtype = dtype ;

        } else {
            throw new Error("iJS-gettext:'bindtextdomain': type: *"+dtype+"* is not supported. Use *mo*, *po* or *json* files.") ;
        }
    } else {
        new_dtype = "mo" ;
    };

    if (iJS.isString( localePath ) ) {
        new_locale_path = localePath ;

    } else {
        new_locale_path = "" ;
    }


    if ( !iJS.isArray( this.domain_registry ) ) this.domain_registry = [];

    if (!this.domain_registry.length) {    //first initialization
        this.domain_registry.push( {value: new_domain, path: new_locale_path, type: new_dtype} ) ;

    } else {    //attempt to add new domain or reset if it’s already added. 

        var isNewDomaine = true ;

        for (var d in this.domain_registry) {

            if (this.domain_registry[d].value == new_domain) {

                console.warn("iJS-gettext:'bindtextdomain': domaine: *"+new_domain+"* is already added and will just be reset") ;
                this.domain_registry[d].path = new_locale_path ;
                this.domain_registry[d].type = new_dtype ;
                isNewDomaine = false ;
                break;
            }
        }

        if (isNewDomaine) this.domain_registry.push( {value: new_domain, path: new_locale_path, type: new_dtype} ) ;
    }
};

/**
 * Use for some concatenation: see for example `iJS.Gettext.prototype.parse_po`.
 * @private
 * @memberof iJS.Gettext
 */
iJS.Gettext.context_glue = "\004" ;
/**
 * json structure of all registered domain with corresponding messages data.
 * It depend of setting locale which define the catalog that will be load.
 * It will also content messages data that are parsed from developer’s defined json'd portable object. 
 * @private
 * @memberof iJS.Gettext
 */
iJS.Gettext._locale_data = {} ;

/**
 * Load and parse all the messages data from domain in the domain’s registry.
 * Data are load depending of the setting catalog or developer’s defined json’d portable object.
 * Parsed data are save in a internal json structure, to make them easily accessible, depending of the current domain.
 * This method have to be always call after a `setlocale` and `bindtextdomain` call.
 * @memberof iJS.Gettext
 */
iJS.Gettext.prototype.try_load_lang = function () {

    if (iJS.isSet( this.domain_registry ) && iJS.isSet( this.locale) ) {

        /* @TODO execept the fact that loaded file are cached by browser, 
         *so that new reload must be fast, it's better to see how to keep already load messages data;
         *and just download those which have to be loaded.
        */
        //firstly clean the locale data, assuming that it will content new parsed data.
        iJS.Gettext._locale_data = {} ;

        // NOTE: there will be a delay here, as this is async.
        // So, any i18n calls made right after page load may not
        // get translated.
        // XXX: we may want to see if we can "fix" this behavior
        var domain = null ,
            link   = null ;
        for (var d in this.domain_registry) {

            domain = this.domain_registry[d] ;
            //When get *link.href* it return the absolute path, event if it initially define with *relative path*.
            //That why is more convenient to define *link* as `HTMLlinkElement` than as `string`.
            link = document.createElement("link") ; 
            if (domain.type == 'json') {

                link.href = domain.path+"/"+this.locale+"/LC_MESSAGES/"+domain.value+".json" ;
                if (! this.try_load_lang_json(link.href) ) {

                    this.try_load_alternative_lang(domain, link) ;
                }
            } else if (domain.type == 'po') {

                link.href = domain.path+"/"+this.locale+"/LC_MESSAGES/"+domain.value+".po" ;
                if (! this.try_load_lang_po(link.href) ) {

                    this.try_load_alternative_lang(domain, link) ;
                }
            } else {
                //if `domain.path` is not define, check to see if language is statically included via  a json object.
                if (domain.path == "") {

                    if (typeof( this.locale_data ) != 'undefined') {
                        // we're going to reformat it, and overwrite the variable
                        var locale_data_copy = this.locale_data ;
                        this.locale_data = undefined ;
                        this.parse_locale_data(locale_data_copy) ;

                        if (typeof( iJS.Gettext._locale_data[domain.value] ) == 'undefined') {
                            console.error("iJS-gettext:'try_load_lang':'locale_data': does not contain the domain '"+domain.value+"'") ;
                        }
                    }

                } else {
                    // TODO: implement the other types (.mo)
                    /*link.href = domain.path+"/"+this.locale+"/LC_MESSAGES/"+domain.value+".mo" ;
                    if (! this.try_load_lang_mo(link.href) ) {

                        this.try_load_alternative_lang(domain, link) ;
                    }//*/
                    throw new Error("TODO: link type mo found, support is planned, but not implemented at this time.") ;
                }

            }
        }

    } else {
        console.warn("iJS-gettext:'try_load_lang': Not thing to do. It’s seem like no locale or domain have been register. Use `setlocale` or `bindtextdomain` for that.") ;
    }
};

/**
 * Try to load messages data from alternative catalog when associated catalog of user’s given locale can’t be found. <BR/>
 * for example for a given "en_US.UTF8" locale, if associated catalog can’t be found, this will try to find it with "en_US" or "en".
 * @private
 * @memberof iJS.Gettext
 * @param {Object} domain          from domain’s registry
 * @param {HTMLLinkElement} link   content the catalog’s path
 */
iJS.Gettext.prototype.try_load_alternative_lang = function (domain, link) {

    if (iJS.isObject( domain ) && iJS.isHTMLLinkElement( link )) {

        var isCatalogOk = false ;

        switch (this.locale_format) {

            case 2: //locale name format is something like *en_US.utf8*. will try to use *en_US* or *en* format
                console.warn("iJS-gettext:'try_load_lang': domaine: *"+domain.value+"* not found with locale: *"+this.locale+"* format. Will try to use *"+this.locale.split('.')[0]+"* format...") ;
                link.href = domain.path+"/"+this.locale.split('.')[0]+"/LC_MESSAGES/"+domain.value+"."+domain.type ;

                if (domain.type == "json")
                    isCatalogOk = (this.try_load_lang_json( link.href )) ? true : false ;
                else if (domain.type == "po")
                    isCatalogOk = (this.try_load_lang_po( link.href )) ? true : false ;
                //else
                //@TODO it will be by default "mo", not supported yet but it’s plan.

                if (! isCatalogOk) {

                    console.warn("iJS-gettext:'try_load_lang': domaine: *"+domain.value+"* not found with locale: *"+this.locale.split('.')[0]+"* format. Will try to use *"+this.locale.split('_')[0]+"* format...") ;
                    link.href = domain.path+"/"+this.locale.split('_')[0]+"/LC_MESSAGES/"+domain.value+"."+domain.type ;

                    if (domain.type == "json")
                        isCatalogOk = (this.try_load_lang_json( link.href )) ? true : false ;
                    else if (domain.type == "po")
                        isCatalogOk = (this.try_load_lang_po( link.href )) ? true : false ;
                    //else
                    //@TODO it will be by default "mo", not supported yet but it’s plan.
                    //isCatalogOk = (this.try_load_lang_mo( link.href )) ? true : false ;

                    if (! isCatalogOk) {

                        link.href = domain.path+"/"+this.locale+"/LC_MESSAGES/"+domain.value+"."+domain.type;
                        console.warn("iJS-gettext:'try_load_lang_"+domain.type+"': failed. Unable to exec XMLHttpRequest for link ["+link.href+"]") ;
                    }
                }
                break;

            case 1://locale name format is something like *en_US*. will try to use *en* format
                console.warn("iJS-gettext:'try_load_lang': domaine: *"+domain.value+"* not found with locale: *"+this.locale+"* format. Will try to use *"+this.locale.split('_')[0]+"* format...") ;
                link.href = domain.path+"/"+this.locale.split('_')[0]+"/LC_MESSAGES/"+domain.value+"."+domain.type ;

                if (domain.type == "json")
                    isCatalogOk = (this.try_load_lang_json( link.href )) ? true : false ;
                else if (domain.type == "po")
                    isCatalogOk = (this.try_load_lang_po( link.href )) ? true : false ;
                //else
                //@TODO it will be by default "mo", not supported yet but it’s plan.
                //isCatalogOk = (this.try_load_lang_mo( link.href )) ? true : false ;

                if (! isCatalogOk) {

                    link.href = domain.path+"/"+this.locale+"/LC_MESSAGES/"+domain.value+"."+domain.type;
                    console.error("iJS-gettext:'try_load_lang_"+domain.type+"': failed. Unable to exec XMLHttpRequest for link ["+link.href+"]") ;
                }
                break;

            default:
                console.error("iJS-gettext:'try_load_lang_"+domain.type+"': failed. Unable to exec XMLHttpRequest for link ["+link.href+"]") ;
                break;
        }
    } else {

        console.warn("iJS-gettext:'try_load_alternative_lang': nothing to do or invalid arguments.") ;
    }

};

/**
 * This takes a json’d data (a portable object variant) and moves it into an internal form, 
 * for use in our lib, and puts it in our object as: 
 * <PRE><CODE>
   iJS.Gettext._locale_data = {
          domain : {
              head : { headfield : headvalue },
              msgs : {
                  msgid : [ msgid_plural, msgstr, msgstr_plural ],
              },
            ...
   </CODE></PRE>
 * The json’d data have to respect the library specifications for that. 
 * For details see the script **po2json** in the associated binary directory.
 * Also see tutorials for more explanations.
 * @private
 * @memberof iJS.Gettext
 * @param   {Object} locale_data json *portable object*
 * @returns {Object}   [[Description]]
 */
iJS.Gettext.prototype.parse_locale_data = function (locale_data) {

    if (typeof( iJS.Gettext._locale_data ) == 'undefined') {
        iJS.Gettext._locale_data = {};
    }

    // suck in every domain defined in the supplied data
    for (var domain in locale_data) {
        // skip empty specs (flexibly)
        if ((! locale_data.hasOwnProperty(domain)) || (! iJS.isSet(locale_data[domain])))
            continue;
        // skip if it has no msgid's
        var has_msgids = false;
        for (var msgid in locale_data[domain]) {
            has_msgids = true;
            break;
        }
        if (! has_msgids) continue;

        // grab shortcut to data
        var data = locale_data[domain];

        // if they specifcy a blank domain, default to "messages"
        if (domain == "") domain = "messages";
        // init the data structure
        if (! iJS.isSet( iJS.Gettext._locale_data[domain]) )
            iJS.Gettext._locale_data[domain] = { };
        if (! iJS.isSet( iJS.Gettext._locale_data[domain].head) )
            iJS.Gettext._locale_data[domain].head = { };
        if (! iJS.isSet( iJS.Gettext._locale_data[domain].msgs) )
            iJS.Gettext._locale_data[domain].msgs = { };

        for (var key in data) {
            if (key == "") {
                var header = data[key];
                for (var head in header) {
                    var h = head.toLowerCase();
                    iJS.Gettext._locale_data[domain].head[h] = header[head];
                }
            } else {
                iJS.Gettext._locale_data[domain].msgs[key] = data[key];
            }
        }
    }

    // build the plural forms function
    for (var domain in iJS.Gettext._locale_data) {

        if (iJS.isSet( iJS.Gettext._locale_data[domain].head['plural-forms'] ) &&
            typeof( iJS.Gettext._locale_data[domain].head.plural_func ) == 'undefined') {
            // untaint data
            var plural_forms = iJS.Gettext._locale_data[domain].head['plural-forms'];
            var pf_re = new RegExp('^(\\s*nplurals\\s*=\\s*[0-9]+\\s*;\\s*plural\\s*=\\s*(?:\\s|[-\\?\\|&=!<>+*/%:;a-zA-Z0-9_\(\)])+)', 'm');
            if (pf_re.test(plural_forms)) {
                //ex english: "Plural-Forms: nplurals=2; plural=(n != 1);\n"
                //pf = "nplurals=2; plural=(n != 1);";
                //ex russian: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10< =4 && (n%100<10 or n%100>=20) ? 1 : 2)
                //pf = "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)";

                var pf = iJS.Gettext._locale_data[domain].head['plural-forms'];
                if (! /;\s*$/.test(pf)) pf = pf.concat(';');
                /* We used to use eval, but it seems IE has issues with it.
                 * We now use "new Function", though it carries a slightly
                 * bigger performance hit.
                var code = 'function (n) { var plural; var nplurals; '+pf+' return { "nplural" : nplurals, "plural" : (plural === true ? 1 : plural ? plural : 0) }; };';
                iJS.Gettext._locale_data[domain].head.plural_func = eval("("+code+")");
                */
                var code = 'var plural; var nplurals; '+pf+' return { "nplural" : nplurals, "plural" : (plural === true ? 1 : plural ? plural : 0) };';
                iJS.Gettext._locale_data[domain].head.plural_func = new Function("n", code);

            } else {
                throw new Error("iJS-gettext:'parse_locale_data': Syntax error in language file. Plural-Forms header is invalid ["+plural_forms+"]");
            }   

            // default to english plural form
        } else if (typeof( iJS.Gettext._locale_data[domain].head.plural_func ) == 'undefined') {
            iJS.Gettext._locale_data[domain].head.plural_func = function (n) {
                var p = (n != 1) ? 1 : 0;
                return { 'nplural' : 2, 'plural' : p };
            };
        } // else, plural_func already created
    }

    return;
};


/**
 * Do an ajax call to load in a .po files, language definitions from associated catalog.
 * @private
 * @memberof iJS.Gettext
 * @param   {string} uri link to the "po" files
 * @returns {number} *1* if the operation is a success, *undefined* if not.
 */
iJS.Gettext.prototype.try_load_lang_po = function (uri) {

    var data = this.sjax(uri);
    if (! data) return;
    var domain = this.uri_basename(uri);
    var parsed = this.parse_po(data);

    var rv = {};
    // munge domain into/outof header
    if (parsed) {
        if (! parsed[""]) parsed[""] = {};
        if (! parsed[""]["domain"]) parsed[""]["domain"] = domain;
        domain = parsed[""]["domain"];
        rv[domain] = parsed;

        this.parse_locale_data(rv);
    }

    return 1;
};

/**
 * Do an ajax call to load in a .mo files, language definitions from associated catalog.
 * @NOTE not yet ready
 * @TODO put available when it will ready. For problems here see `parso_mo` implementation. 
 * @private
 * @memberof iJS.Gettext
 * @param   {string} uri link to the "mo" files
 * @returns {number} *1* if the operation is a success, *undefined* if not.
 */
iJS.Gettext.prototype.try_load_lang_mo = function (uri) {

    var data = this.sjax(uri);
    if (! data) return;
    var domain = this.uri_basename(uri);
    var parsed = this.parse_mo(data);
//alert(parsed);
    var rv = {};
    // munge domain into/outof header
    if (parsed) {
        if (! parsed[""]) parsed[""] = {};
        if (! parsed[""]["domain"]) parsed[""]["domain"] = domain;
        domain = parsed[""]["domain"];
        rv[domain] = parsed;

        this.parse_locale_data(rv);
    }

    return 1;
};

/**
 * Get the base name of an url.
 * Needed for know in which domain are loaded the messages data.
 * Url’s base name will be considered as domain.
 * @private
 * @memberof iJS.Gettext
 * @param   {string} uri an url
 * @returns {string} the base name of the given url.
 */
iJS.Gettext.prototype.uri_basename = function (uri) {

    var rv;
    if (rv = uri.match(/^(.*\/)?(.*)/)) {
        var ext_strip;
        if (ext_strip = rv[2].match(/^(.*)\..+$/))
            return ext_strip[1];
        else
            return rv[2];
    } else {
        return "";
    }
};

/**
 * Parse po data in a json structure. 
 * (like the library associated **po2json** perl script). 
 * @TODO ( also associate a **po2json** nodejs script). 
 * @private
 * @memberof iJS.Gettext
 * @param   {String}   data a portable object content
 * @returns {Object} a json parsed data
 */
iJS.Gettext.prototype.parse_po = function (data) {

    var rv = {};
    var buffer = {};
    var lastbuffer = "";
    var errors = [];
    var lines = data.split("\n");

    for (var i=0; i<lines.length; i++) {
        // chomp
        lines[i] = lines[i].replace(/(\n|\r)+$/, '');

        var match;
        // Empty line / End of an entry.
        if (/^$/.test(lines[i])) {
            if (typeof( buffer['msgid'] ) != 'undefined') {
                var msg_ctxt_id = (typeof( buffer['msgctxt'] ) != 'undefined' &&
                                   buffer['msgctxt'].length) ?
                    buffer['msgctxt']+iJS.Gettext.context_glue+buffer['msgid'] :
                buffer['msgid'];
                var msgid_plural = (typeof( buffer['msgid_plural'] ) != 'undefined' &&
                                    buffer['msgid_plural'].length) ?
                    buffer['msgid_plural'] :
                null;

                // find msgstr_* translations and push them on
                var trans = [];
                for (var str in buffer) {
                    var match;
                    if (match = str.match(/^msgstr_(\d+)/))
                        trans[parseInt(match[1])] = buffer[str];
                }
                trans.unshift(msgid_plural);

                // only add it if we've got a translation
                // NOTE: this doesn't conform to msgfmt specs
                if (trans.length > 1) rv[msg_ctxt_id] = trans;

                buffer = {};
                lastbuffer = "";
            }

            // comments
        } else if (/^#/.test(lines[i])) {
            continue;

            // msgctxt
        } else if (match = lines[i].match(/^msgctxt\s+(.*)/)) {
            lastbuffer = 'msgctxt';
            buffer[lastbuffer] = this.parse_po_dequote(match[1]);

            // msgid
        } else if (match = lines[i].match(/^msgid\s+(.*)/)) {
            lastbuffer = 'msgid';
            buffer[lastbuffer] = this.parse_po_dequote(match[1]);

            // msgid_plural
        } else if (match = lines[i].match(/^msgid_plural\s+(.*)/)) {
            lastbuffer = 'msgid_plural';
            buffer[lastbuffer] = this.parse_po_dequote(match[1]);

            // msgstr
        } else if (match = lines[i].match(/^msgstr\s+(.*)/)) {
            lastbuffer = 'msgstr_0';
            buffer[lastbuffer] = this.parse_po_dequote(match[1]);

            // msgstr[0] (treak like msgstr)
        } else if (match = lines[i].match(/^msgstr\[0\]\s+(.*)/)) {
            lastbuffer = 'msgstr_0';
            buffer[lastbuffer] = this.parse_po_dequote(match[1]);

            // msgstr[n]
        } else if (match = lines[i].match(/^msgstr\[(\d+)\]\s+(.*)/)) {
            lastbuffer = 'msgstr_'+match[1];
            buffer[lastbuffer] = this.parse_po_dequote(match[2]);

            // continued string
        } else if (/^"/.test(lines[i])) {
            buffer[lastbuffer] += this.parse_po_dequote(lines[i]);

            // something strange
        } else {
            errors.push("Strange line ["+i+"] : "+lines[i]);
        }
    }

    // handle the final entry
    if (typeof( buffer['msgid'] ) != 'undefined') {

        var msg_ctxt_id = (typeof( buffer['msgctxt'] ) != 'undefined' && buffer['msgctxt'].length) ?
            buffer['msgctxt']+iJS.Gettext.context_glue+buffer['msgid'] : buffer['msgid'];
        var msgid_plural = (typeof( buffer['msgid_plural'] ) != 'undefined' &&
                            buffer['msgid_plural'].length) ? buffer['msgid_plural'] : null;

        // find msgstr_* translations and push them on
        var trans = [];
        for (var str in buffer) {
            var match;
            if (match = str.match(/^msgstr_(\d+)/))
                trans[parseInt(match[1])] = buffer[str];
        }
        trans.unshift(msgid_plural);

        // only add it if we've got a translation
        // NOTE: this doesn't conform to msgfmt specs
        if (trans.length > 1) rv[msg_ctxt_id] = trans;

        buffer = {};
        lastbuffer = "";
    }

    // parse out the header
    if (rv[""] && rv[""][1]) {
        var cur = {};
        var hlines = rv[""][1].split(/\\n/);
        for (var i=0; i<hlines.length; i++) {
            if (! hlines.length) continue;

            var pos = hlines[i].indexOf(':', 0);
            if (pos != -1) {
                var key = hlines[i].substring(0, pos);
                var val = hlines[i].substring(pos +1);
                var keylow = key.toLowerCase();

                if (cur[keylow] && cur[keylow].length) {
                    errors.push("SKIPPING DUPLICATE HEADER LINE: "+hlines[i]);
                } else if (/#-#-#-#-#/.test(keylow)) {
                    errors.push("SKIPPING ERROR MARKER IN HEADER: "+hlines[i]);
                } else {
                    // remove begining spaces if any
                    val = val.replace(/^\s+/, '');
                    cur[keylow] = val;
                }

            } else {
                errors.push("PROBLEM LINE IN HEADER: "+hlines[i]);
                cur[hlines[i]] = '';
            }
        }

        // replace header string with assoc array
        rv[""] = cur;
    } else {
        rv[""] = {};
    }

    // TODO: XXX: if there are errors parsing, what do we want to do?
    // GNU Gettext silently ignores errors. So will we.
    // alert( "Errors parsing po file:\n" + errors.join("\n") );

    return rv;
};

/**
 * Unscaled all embedded quotes in a string. Useful when parsing a po messages data.
 * @private
 * @memberof iJS.Gettext
 * @param   {String}   str string to analyse
 * @returns {String} formated string
 */
iJS.Gettext.prototype.parse_po_dequote = function (str) {

    var match;
    if (match = str.match(/^"(.*)"/)) {
        str = match[1];
    }
    // unescale all embedded quotes (fixes bug #17504)
    str = str.replace(/\\"/g, "\"");
    return str;
};


/**
 * @constant {Number} Magic constant to check the endianness of the input file.
 * @memberof iJS.Gettext
 */
iJS.Gettext.prototype.MAGIC = 314425327;

/**
 * Parses a header string into an object of key-value pairs
 * @memberof iJS.Gettext
 * @private
 * @param {String} str Header string
 * @return {Object} An object of key-value pairs
 */
iJS.Gettext.prototype.parseHeader = function (str) {
    
    var lines = (str || '').split('\n'),
        headers = {};

    lines.forEach(function(line) {
        var parts = line.trim().split(':'),
            key = (parts.shift() || '').trim().toLowerCase(),
            value = parts.join(':').trim();
        if (!key) {
            return;
        }
        headers[key] = value;
    });

    return headers;
} ;

/**
 * Normalizes charset name. Converts utf8 to utf-8, WIN1257 to windows-1257 etc.
 * @TODO see if it really necessary here.
 * @memberof iJS.Gettext
 * @private
 * @param {String} charset Charset name
 * @return {String} Normalized charset name
 */
iJS.Gettext.prototype.formatCharset = function (charset, defaultCharset) {
    
    return (charset || 'iso-8859-1').toString().toLowerCase().
    replace(/^utf[\-_]?(\d+)$/, 'utf-$1').
    replace(/^win(?:dows)?[\-_]?(\d+)$/, 'windows-$1').
    replace(/^latin[\-_]?(\d+)$/, 'iso-8859-$1').
    replace(/^(us[\-_]?)?ascii$/, 'ascii').
    replace(/^charset$/, defaultCharset || 'iso-8859-1').
    trim();
};


/**
 * Parse mo data in a json structure. 
 * (like the library associated **po2json** perl script). 
 * @TODO ( also associate a **po2json** nodejs script).
 * @NOTE not yet ready. Base on **moparser** of [node-gettext](http://github.com/andris9/node-gettext).
 * @TODO put available when it will ready. Problems here (depending of `parso_mo` implementation) 
 *       are detection of magic number for *.mo* buffer and manipulating the considered buffer,
 *       function of little endian or big endian structure. 
 * @private
 * @memberof iJS.Gettext
 * @param   {String}   data a portable object content
 * @returns {Object} a json parsed data
 */
iJS.Gettext.prototype.parse_mo = function (data, defaultCharset) {
    
    var _fileContents = new iJS.Buffer(data) ,
        _writeFunc = 'writeUInt32LE' , //Method name for writing int32 values, default littleendian
        _readFunc = 'readUInt32LE' , //Method name for reading int32 values, default littleendian
        _charset = defaultCharset || 'iso-8859-1', 
        
        _table = {
            charset: _charset,
            headers: undefined,
            translations: {}
        };

  /**
   * Checks if number values in the input file are in big- or littleendian format.
   */
    //from mopaser _checkMagick function
    //alert (_fileContents.readUInt32LE(0))
    //alert (this.MAGIC)
    //alert (_fileContents.readUInt32LE(0) == this.MAGIC)
    if (_fileContents.readUInt32LE(0) == this.MAGIC) {
        _readFunc = 'readUInt32LE';
        _writeFunc = 'writeUInt32LE';
        //return true;
    } else if (_fileContents.readUInt32BE(0) === this.MAGIC) {
        _readFunc = 'readUInt32BE';
        _writeFunc = 'writeUInt32BE';
        //return true;
    } else {
        return false;
    }

    /**
     * GetText revision nr, usually 0
     */
    _revision = _fileContents[_readFunc](4);

    /**
     * Total count of translated strings
     */
    _total = _fileContents[_readFunc](8);
    
    /**
     * Offset position for original strings table
     */
    _offsetOriginals = _fileContents[_readFunc](12);

    /**
     * Offset position for translation strings table
     */
    _offsetTranslations = _fileContents[_readFunc](16);

     /**
      * Read the original strings and translations from the input MO file. Use the
      * first translation string in the file as the header.
      */
    // Load translations into _translationTable
    var offsetOriginals = _offsetOriginals,
        offsetTranslations = _offsetTranslations,
        position, length,
        msgid, msgstr;

    for (var i = 0; i < _total; i++) {
        // msgid string
        length = _fileContents[_readFunc](offsetOriginals);
        offsetOriginals += 4;
        position = _fileContents[_readFunc](offsetOriginals);
        offsetOriginals += 4;
        msgid = _fileContents.slice(position, position + length);

        // matching msgstr
        length = _fileContents[_readFunc](offsetTranslations);
        offsetTranslations += 4;
        position = _fileContents[_readFunc](offsetTranslations);
        offsetTranslations += 4;
        msgstr = _fileContents.slice(position, position + length);

        if (!i && !msgid.toString()) {
            /**
             * Detects charset for MO strings from the header
             */
            var headersStr = headers.toString(),
                match;

            if ((match = headersStr.match(/[; ]charset\s*=\s*([\w\-]+)/i))) {
                _charset = _table.charset = this.formatCharset(match[1], _charset);
            }

            //headers = encoding.convert(headers, 'utf-8', _charset).toString('utf-8');

            _table.headers = this.parseHeader(headersStr.toString('utf-8'));
        }

        //msgid = encoding.convert(msgid, 'utf-8', _charset).toString('utf-8');
        //msgstr = encoding.convert(msgstr, 'utf-8', _charset).toString('utf-8');

        /**
        * Adds a translation to the translation object
        */
        //form mopaser _addString(msgid, msgstr) ;
        //alert ("test")
        var translation = {},
            parts, msgctxt, msgid_plural;

        msgid = msgid.split('\u0004');
        if (msgid.length > 1) {
            msgctxt = msgid.shift();
            translation.msgctxt = msgctxt;
        } else {
            msgctxt = '';
        }
        msgid = msgid.join('\u0004');

        parts = msgid.split('\u0000');
        msgid = parts.shift();

        translation.msgid = msgid;

        if ((msgid_plural = parts.join('\u0000'))) {
            translation.msgid_plural = msgid_plural;
        }

        msgstr = msgstr.split('\u0000');
        translation.msgstr = [].concat(msgstr || []);

        if (!_table.translations[msgctxt]) {
            _table.translations[msgctxt] = {};
        }

        _table.translations[msgctxt][msgid] = translation;
    }

    // dump the file contents object
    _fileContents = null;

    return _table;
    
};


/**
 * Do an ajax call to load in a .json files, language definitions from associated catalog.
 * @private
 * @memberof iJS.Gettext
 * @param   {string} uri link to the "json" files
 * @returns {number} *1* if the operation is a success, *undefined* if not.
 */
iJS.Gettext.prototype.try_load_lang_json = function (uri) {

    var data = this.sjax(uri);
    if (! data) return;

    var rv = this.JSON(data);
    this.parse_locale_data(rv);

    return 1;
};

/**
 * Set domain for future `gettext()` calls. <BR/>
 * If the given domain is not NULL, the current message domain is set to it; 
 * else the function returns the current message domain. <BR/>
 * A  message  domain  is  a  set of translatable msgid messages. Usually,
 * every software package has its own message domain. The domain  name  is
 * used to determine the message catalog where a translation is looked up;
 * it must be a non-empty string.
 * @memberof iJS.Gettext
 * @param   {string} domain  message domain to set as current.
 * @returns {string} current message domain.
 */
iJS.Gettext.prototype.textdomain = function (domain) {

    if (domain && domain.length) this.domain = domain;
    return this.domain;
}


/**
 * Returns the translation for **msgid**.<BR/>
 * If translation can’t be found, the unmodified **msgid** is returned.
 * @memberof iJS.Gettext
 * @param   {String} msgid  Message to translate
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.gettext = function (msgid) {

    var msgctxt;
    var msgid_plural;
    var n;
    var category;
    return this.dcnpgettext(null, msgctxt, msgid, msgid_plural, n, category);
};


/**
 * Like `gettext()`, but retrieves the message for the specified 
 * **TEXTDOMAIN** instead of the default domain.
 * @memberof iJS.Gettext
 * @param   {String} domain  Domain where translation can be found.
 * @param   {String} msgid   Message to translate
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dgettext = function (domain, msgid) {

    var msgctxt;
    var msgid_plural;
    var n;
    var category;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category);
};

/**
 * Like `dgettext()` but retrieves the message from the specified **CATEGORY**
 * instead of the default category "LC_MESSAGES". <BR/>
 * <U>NOTE:</U> the categories are really useless in javascript context. This is
 * here for GNU Gettext API compatibility. In practice, you'll never need
 * to use this. This applies to all the calls including the **CATEGORY**.
 * @memberof iJS.Gettext
 * @param   {String} domain      Domain where translation can be found.
 * @param   {String} msgid       Message to translate
 * @param   {String} category    (for now is will always be "LC_MESSAGES")
 * @returns {String} translated  text or the *msgid* if not found
 */
iJS.Gettext.prototype.dcgettext = function (domain, msgid, category) {

    var msgctxt;
    var msgid_plural;
    var n;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category);
};


/**
 * Retrieves the correct translation for **count** items.
 * @memberof iJS.Gettext
 * @param   {String} msgid        Message to translate
 * @param   {String} msgid_plural Plural form of text to translate
 * @param   {Number} n            Counting number
 * @returns {String} translated text or the *msgid* if not found
 * @example
 * //In legacy software you will often find something like:
 * alert( count + " file(s) deleted.\n" );
 * //Before ngettext() was introduced, one of best practice for internationalized programs was:
    if (count == 1)
        alert( iJS._("One file deleted.\n") );
    else ...

   //This is a nuisance for the programmer and often still not sufficient for an adequate translation.  
   //Many languages have completely different ideas on numerals.  Some (French, Italian, ...) treat 0 and 1 alike,
   //others make no distinction at all (Japanese, Korean, Chinese, ...), others have two or more plural forms (Russian, 
   //Latvian, Czech, Polish, ...).  The solution is:

    alert( iJS.i18n.ngettext("One file deleted.\n", "%d files deleted.\n", count) );
 */
iJS.Gettext.prototype.ngettext = function (msgid, msgid_plural, n) {

    var msgctxt;
    var category;
    return this.dcnpgettext(null, msgctxt, msgid, msgid_plural, n, category);
};

/**
 * Like `ngettext()` but retrieves the translation from the specified
 * textdomain instead of the default domain.
 * @memberof iJS.Gettext
 * @param   {String} domain       Domain where translation can be found.
 * @param   {String} msgid        Message to translate
 * @param   {String} msgid_plural Plural form of text to translate
 * @param   {Number} n            Counting number
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dngettext = function (domain, msgid, msgid_plural, n) {

    var msgctxt;
    var category;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category);
};

/**
 * Like `dngettext()` but retrieves the translation from the specified
 * category, instead of the default category **LC_MESSAGES**.
 * @memberof iJS.Gettext
 * @param   {String} domain       Domain where translation can be found.
 * @param   {String} msgid        Message to translate
 * @param   {String} msgid_plural Plural form of text to translate
 * @param   {Number} n            Counting number
 * @param   {String} category    (for now is will always be "LC_MESSAGES")
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dcngettext = function (domain, msgid, msgid_plural, n, category) {

    var msgctxt;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category, category);
};

/**
 * Returns the translation of **msgid**, given the context of **msgctxt**.<BR/>
 * Both items are used as a unique key into the message catalog.
 * This allows the translator to have two entries for words that may
 * translate to different foreign words based on their context.
 * @memberof iJS.Gettext
 * @param   {String} msgctxt  context of text
 * @param   {String} msgid    Message to translate
 * @returns {String} translated text or the *msgid* if not found
 * @example 
 * // The word "View" may be a noun or a verb, which may be
 * //used in a menu as File->View or View->Source.

    alert( iJS.i18n.pgettext( "Verb: To View", "View" ) );
    alert( iJS.i18n.pgettext( "Noun: A View", "View"  ) );
 * // The above will both lookup different entries in the message catalog.
 */
iJS.Gettext.prototype.pgettext = function (msgctxt, msgid) {

    var msgid_plural;
    var n;
    var category;
    return this.dcnpgettext(null, msgctxt, msgid, msgid_plural, n, category);
};

/**
 * Like `pgettext()`, but retrieves the message for the specified 
 * **domain** instead of the default domain.
 * @memberof iJS.Gettext
 * @param   {String} domain   Domain where translation can be found.
 * @param   {String} msgctxt  Context of text
 * @param   {String} msgid    Message to translate
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dpgettext = function (domain, msgctxt, msgid) {

    var msgid_plural;
    var n;
    var category;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category);
};

/**
 * Like `dpgettext()` but retrieves the message from the specified **category**
 * instead of the default category **LC_MESSAGES**.
 * @memberof iJS.Gettext
 * @param   {String} domain   Domain where translation can be found.
 * @param   {String} msgctxt  Context of text
 * @param   {String} msgid    Message to translate
 * @param   {String} category (for now is will always be "LC_MESSAGES")
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dcpgettext = function (domain, msgctxt, msgid, category) {

    var msgid_plural;
    var n;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category);
};


/**
 * Like `ngettext()` with the addition of context as in `pgettext()`. <BR/>
 * In English, or if no translation can be found, the second argument
 * *msgid* is picked if *n* is one, the third one otherwise.
 * @memberof iJS.Gettext
 * @param   {String} msgctxt      Context of text
 * @param   {String} msgid        Message to translate
 * @param   {String} msgid_plural Plural form of text to translate
 * @param   {Number} n            Counting number
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.npgettext = function (msgctxt, msgid, msgid_plural, n) {

    var category;
    return this.dcnpgettext(null, msgctxt, msgid, msgid_plural, n, category);
};

/**
 * Like `npgettext()` but retrieves the translation from the specified
 * textdomain instead of the default domain.
 * @memberof iJS.Gettext
 * @param   {String} domain       Domain where translation can be found.
 * @param   {String} msgctxt      Context of text
 * @param   {String} msgid        Message to translate
 * @param   {String} msgid_plural Plural form of text to translate
 * @param   {Number} n            Counting number
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dnpgettext = function (domain, msgctxt, msgid, msgid_plural, n) {

    var category;
    return this.dcnpgettext(domain, msgctxt, msgid, msgid_plural, n, category);
};


// this has all the options, so we use it for all of previous `gettext()`.
/**
 * Like `dnpgettext()` but retrieves the translation from the specified
 * category, instead of the default category **LC_MESSAGES**.
 * @memberof iJS.Gettext
 * @param   {String} domain       Domain where translation can be found.
 * @param   {String} msgctxt      Context of text
 * @param   {String} msgid        Message to translate
 * @param   {String} msgid_plural Plural form of text to translate
 * @param   {Number} n    
 * @param   {String} category (for now is will always be "LC_MESSAGES")
 * @returns {String} translated text or the *msgid* if not found
 */
iJS.Gettext.prototype.dcnpgettext = function (domain, msgctxt, msgid, msgid_plural, n, category) {

    if (! iJS.isSet(msgid)) return '';

    var plural = iJS.isSet(msgid_plural);
    var msg_ctxt_id = iJS.isSet(msgctxt) ? msgctxt+iJS.Gettext.context_glue+msgid : msgid;

    var domainname = iJS.isSet(domain) ? domain : iJS.isSet(this.domain) ? this.domain : 'messages';

    // category is always LC_MESSAGES. We ignore all else
    var category_name = 'LC_MESSAGES';
    var category = 5;

    var locale_data = new Array();
    if (typeof( iJS.Gettext._locale_data ) != 'undefined' &&
        iJS.isSet( iJS.Gettext._locale_data[domainname]) ) {
        locale_data.push( iJS.Gettext._locale_data[domainname] );

    } else if (typeof( iJS.Gettext._locale_data ) != 'undefined') {
        // didn't find domain we're looking for. Search all of them.
        for (var dom in iJS.Gettext._locale_data) {
            locale_data.push( iJS.Gettext._locale_data[dom] );
        }
    }

    var trans = [];
    var found = false;
    var domain_used; // so we can find plural-forms if needed
    if (locale_data.length) {
        for (var i=0; i<locale_data.length; i++) {
            var locale = locale_data[i];
            if (iJS.isSet(locale.msgs[msg_ctxt_id])) {
                // make copy of that array (cause we'll be destructive)
                for (var j=0; j<locale.msgs[msg_ctxt_id].length; j++) {
                    trans[j] = locale.msgs[msg_ctxt_id][j];
                }
                trans.shift(); // throw away the msgid_plural
                domain_used = locale;
                found = true;
                // only break if found translation actually has a translation.
                if ( trans.length > 0 && trans[0].length != 0 )
                    break;
            }
        }
    }

    // default to english if we lack a match, or match has zero length
    if ( trans.length == 0 || trans[0].length == 0 ) {
        trans = [ msgid, msgid_plural ];
    }

    var translation = trans[0];
    if (plural) {
        var p;
        if (found && iJS.isSet(domain_used.head.plural_func) ) {
            var rv = domain_used.head.plural_func(n);
            if (! rv.plural) rv.plural = 0;
            if (! rv.nplural) rv.nplural = 0;
            // if plurals returned is out of bound for total plural forms
            if (rv.nplural <= rv.plural) rv.plural = 0;
            p = rv.plural;
        } else {
            p = (n != 1) ? 1 : 0;
        }
        if (iJS.isSet(trans[p]))
            translation = trans[p];
    }

    return translation;
};


/**
 * This is a utility method to provide some way to support positional parameters within a string, as javascript lacks a printf() method.
 * The format is similar to printf(), but greatly simplified (ie. fewer features).<BR/>
 * Any percent signs followed by numbers are replaced with the corresponding item from the argument’s array.
 * @class
 * @constructs Strargs
 * @memberof iJS.Gettext
 * @param   {String} str  a string that potentially contains formatting characters
 * @param   {Array} args  an array of positional replacement values
 * @returns {String} The formatted text.
 * @example
 * iJS.i18n.setlocale("fr_FR.UTF8") ;
 * iJS.i18n.bindtextdomain("fr_FR.UTF8") ;
 * iJS.i18n.try_load_lang() ;
 * //One common mistake is to interpolate a variable into the string like this:
 * var translated = iJS._("Hello " + full_name); //`iJS._()` can be replace by `iJS.i18n.gettext()`

 * //The interpolation will happen before it's passed to gettext, and it's 
 * //unlikely you'll have a translation for every "Hello Tom" and "Hello Dick"
 * //and "Hellow Harry" that may arise.

 * //Use `strargs()` (see below) to solve this problem:

 * var translated = iJS.Gettext.strargs( iJS._("Hello %1"), [full_name] );

 /* This is espeically useful when multiple replacements are needed, as they 
  * may not appear in the same order within the translation. As an English to
  * French example:

  * Expected result: "This is the red ball"
  * English: "This is the %1 %2"
  * French:  "C'est le %2 %1"
  * Code: iJS.Gettext.strargs( iJS._("This is the %1 %2"), ["red", "ball"] );

  * (The example show thing that not have to be done because neither color nor text 
  * will get translated here ...).

 */
iJS.Gettext.strargs = function (str, args) {

    // make sure args is an array
    if ( null == args || 'undefined' == typeof(args) ) {
        args = [];
    } else if (args.constructor != Array) {
        args = [args];
    }

    // NOTE: javascript lacks support for zero length negative look-behind
    // in regex, so we must step through w/ index.
    // The perl equiv would simply be:
    //    $string =~ s/(?<!\%)\%([0-9]+)/$args[$1]/g;
    //    $string =~ s/\%\%/\%/g; # restore escaped percent signs

    var newstr = "";
    while (true) {
        var i = str.indexOf('%');
        var match_n;

        // no more found. Append whatever remains
        if (i == -1) {
            newstr += str;
            break;
        }

        // we found it, append everything up to that
        newstr += str.substr(0, i);

        // check for escpaed %%
        if (str.substr(i, 2) == '%%') {
            newstr += '%';
            str = str.substr((i+2));

            // % followed by number
        } else if ( match_n = str.substr(i).match(/^%(\d+)/) ) {
            var arg_n = parseInt(match_n[1]);
            var length_n = match_n[1].length;
            if ( arg_n > 0 && args[arg_n -1] != null && typeof(args[arg_n -1]) != 'undefined' )
                newstr += args[arg_n -1];
            str = str.substr( (i + 1 + length_n) );

            // % followed by some other garbage - just remove the %
        } else {
            newstr += '%';
            str = str.substr((i+1));
        }
    }

    return newstr;
}


/**
 * instance method wrapper of strargs
 * @memberof iJS.Gettext
 * @param   {String} str  a string that potentially contains formatting characters
 * @param   {Array} args  an array of positional replacement values
 * @returns {String} The formatted text.
 */
iJS.Gettext.prototype.strargs = function (str, args) {

    return iJS.Gettext.strargs(str, args);
}

/**
 * Synchronously get a response text via an ajax call to a file’s url.
 * @private
 * @memberof iJS.Gettext
 * @param   {String} uri file url
 * @returns {String} a response text if succeed or *"undefined"* if not.
 */
iJS.Gettext.prototype.sjax = function (uri) {

    var xmlhttp = iJS.newHTTPRequest() ;

    if (! xmlhttp) {
        console.error("iJS-gettext:'sjax': Your browser doesn't do Ajax. Unable to support external language files.");

    } else {

        xmlhttp.open('GET', uri, false);
        try { xmlhttp.send(null); }
        catch (e) { return; }

        // we consider status 200 and 0 as ok.
        // 0 happens when we request local file, allowing this to run on local files
        var sjax_status = xmlhttp.status;
        if (sjax_status == 200 || sjax_status == 0) {
            //alert(xmlhttp.responseText)
            return xmlhttp.responseText;
        } else {
            var error = xmlhttp.statusText + " (Error " + xmlhttp.status + ")";
            if (xmlhttp.responseText.length) {
                error += "\n" + xmlhttp.responseText;
            }
            console.error( error );
            return;
        }
    }

}

/**
 * Evaluate A string representing a JavaScript expression, statement, or sequence of statements. 
 * @private
 * @param   {String} data  JavaScript expression
 * @returns {Object} [[Description]]
 */
iJS.Gettext.prototype.JSON = function (data) {
    return eval('(' + data + ')');
}

},{}]},{},[7,6,8]);
