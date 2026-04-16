// node_modules/jj/lib/bundle.js
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var NS = "http://www.w3.org/";
var MATHML_NS = NS + "1998/Math/MathML";
var SVG_NS = NS + "2000/svg";
function errMsg(varName, expected, received, extra) {
  const ret = `Expected '${varName}' to be ${expected}. Got ${received} (${typeof received})`;
  return extra ? `${ret}.
${extra}` : ret;
}
function typeErr(varName, expected, received, extra) {
  return new TypeError(errMsg(varName, expected, received, extra));
}
function isStr(x) {
  return typeof x === "string";
}
function isNum(x) {
  return typeof x === "number" && !Number.isNaN(x);
}
function isObj(x) {
  return typeof x === "object" && x !== null && Object.getPrototypeOf(x) === Object.prototype;
}
function isInstance(x, classConstructor) {
  if (typeof classConstructor !== "function") {
    throw typeErr("classConstructor", "a constructor function", classConstructor);
  }
  return x instanceof classConstructor;
}
function hasProp(x, propName) {
  return x !== null && typeof x === "object" && propName in x;
}
function keb2cam(str) {
  if (!isStr(str)) {
    throw typeErr("str", "a string", str);
  }
  return str.replace(/^-+|-+$/g, "").replace(/-+([a-z])/g, (g, c) => c.toUpperCase());
}
function toStr(x) {
  switch (typeof x) {
    case "string":
      return x;
    case "object":
      if (x === null) {
        return "null";
      }
      try {
        return JSON.stringify(x);
      } catch {
        return String(x);
      }
    case "function":
      return x.toString();
    default:
      return String(x);
  }
}
var _ref;
var _JJET = class _JJET2 {
  /**
   * Creates a JJET instance.
   *
   * @param ref - The EventTarget to wrap.
   * @throws {TypeError} If `ref` is not an EventTarget.
   * @see {@link JJET.from} for the factory form.
   */
  constructor(ref) {
    __privateAdd(this, _ref);
    if (!isInstance(ref, EventTarget)) {
      throw typeErr("ref", "an EventTarget instance", ref);
    }
    __privateSet(this, _ref, ref);
  }
  /**
   * Creates a JJET instance from an EventTarget reference.
   *
   * @param ref - The EventTarget instance.
   * @returns A new JJET instance.
   * @see {@link constructor} for input validation behavior.
   */
  static from(ref) {
    return new _JJET2(ref);
  }
  /**
   * Gets the underlying DOM object.
   *
   * @see {@link run} for fluent callbacks that can also access this same wrapped target.
   */
  get ref() {
    return __privateGet(this, _ref);
  }
  /**
   * Adds an event listener.
   *
   * @example
   * ```ts
   * const onResize = () => {
   *     console.log('resized')
   * }
   *
   * JJET.from(window).on('resize', onResize)
   * ```
   *
   * @example
   * ```ts
   * const target = {
   * dispatching a plain Event object.
   *     increment() {
   *         this.count++
   *     },
   * }
   *
   * @param options Optional event initialization dictionary.
   * ```
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Event/Event | Event()} for details on event options.
   * @param handler - The event handler.
   * @param options - Optional event listener options.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener | EventTarget.addEventListener}
   */
  on(eventName, handler, options) {
    this.ref.addEventListener(eventName, handler, options);
    return this;
  }
  /**
   * Removes an event listener.
   *
   * @remarks
   * Pass the same handler reference that was used in `on()` to properly remove the listener.
   *
   * @example
   * ```ts
   * const onResize = () => {
   *     console.log('resized')
   * }
   *
   * const win = JJET.from(window)
   * win.on('resize', onResize)
   * win.off('resize', onResize)
   * ```
   *
   * @param eventName - The name of the event.
   * @param handler - The event handler.
   * @param options - Optional event listener options or boolean.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/removeEventListener | EventTarget.removeEventListener}
   */
  off(eventName, handler, options) {
    this.ref.removeEventListener(eventName, handler, options);
    return this;
  }
  /**
   * Dispatches an Event at the specified EventTarget.
   *
   * @param event - The Event object to dispatch. Since CustomEvent extends Event, you can also dispatch CustomEvent instances here.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent | EventTarget.dispatchEvent}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent | CustomEvent} for creating custom events with payloads.
   * @see {@link triggerEvent} for a convenience wrapper that creates and dispatches an Event in one step.
   * @see {@link triggerCustomEvent} for a convenience wrapper that creates and dispatches a CustomEvent with JJ's default settings in one step.
   */
  trigger(event) {
    try {
      this.ref.dispatchEvent(event);
      return this;
    } catch (cause) {
      throw new Error(`Failed to trigger the event ${JSON.stringify(event)}`, { cause });
    }
  }
  /**
   * Creates a new `Event` and dispatches on the wrapped target.
   *
   * @remarks
   * This is a convenience wrapper around {@link trigger} for the common case of
   * dispatching a plain Event object.
   *
   * The created event defaults to `bubbles: true` and `composed: true`.
   * Pass `options` to override those defaults.
   *
   * @param type The name identifying the type of the event for example 'click'
   * @param options Optional event initialization dictionary.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Event/Event | Event()} for details on event options.
   */
  triggerEvent(type, options) {
    return this.trigger(new Event(type, { bubbles: true, composed: true, ...options }));
  }
  /**
   * Creates a new `CustomEvent` and dispatches on the wrapped target.
   *
   * @remarks
   * This is a convenience wrapper around {@link trigger} for the common case of
   * dispatching a payload-bearing custom event.
   *
   * The created event defaults to `bubbles: true` and `composed: true`.
   * Pass `options` to override those defaults.
   *
   * @param type - The event type name.
   * @param detail - Optional payload exposed as `event.detail`.
   * @param options - Additional `CustomEvent` options excluding `detail`.
   * @returns This instance for chaining.
   * @example
   * ```ts
   * JJET.from(window).triggerCustomEvent('panel-ready', { id: '123' })
   * ```
   *
   * @example
   * ```ts
   * JJET.from(this).triggerCustomEvent('todo-toggle', {
   *     id: '123',
   *     done: true,
   * })
   * ```
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent | CustomEvent()}
   */
  triggerCustomEvent(type, detail, options) {
    return this.trigger(new CustomEvent(type, { bubbles: true, composed: true, ...options, detail }));
  }
  /**
   * Runs a function in the context of this JJET instance.
   *
   * @example
   * ```ts
   * node
   *   .run(function (context) {
   *     console.log(this.ref)
   *     console.log(context.ref)
   *   })
   *   .trigger(new Event('ready'))
   * ```
   * @remarks
   * Use this to make synchronous adjustments while staying in a fluent chain.
   * The callback return value is ignored.
   * If you want to access the current JJ* instance using `this`, use a `function` rather than an arrow function.
   *
   * @param fn - The synchronous function to run. `this` inside the function will refer to this JJET instance, and the wrapped instance is also passed as the first argument.
   * @returns This instance for chaining.
   * @see {@link ref} for direct access to the wrapped native target.
   * @see {@link on} for event listener chaining.
   * @see {@link trigger} for dispatching events in-chain.
   */
  run(fn) {
    try {
      fn.call(this, this);
    } catch (cause) {
      throw new Error(`Failed to run the function`, { cause });
    }
    return this;
  }
};
_ref = /* @__PURE__ */ new WeakMap();
var JJET = _JJET;
var JJN = class _JJN extends JJET {
  /**
   * Creates a JJN instance from a Node reference.
   *
   * @remarks
   * For better type safety, use the specific wrapper type if you know the Node type:
   * {@link JJHE} for HTMLElement, {@link JJSE} for SVGElement, {@link JJT} for Text, etc.
   *
   * Alternatively, use {@link JJN.wrap} to automatically determine and create the appropriate wrapper.
   *
   * @example
   * ```ts
   * const node = JJN.from(document.createTextNode('hello'))
   * ```
   *
   * @param node - The Node instance.
   * @returns A new JJN instance.
   * @see {@link JJN.wrap} for automatic wrapper selection
   */
  static from(node) {
    return new _JJN(node);
  }
  /**
   * Checks if a value can be passed to the `wrap()` or `unwrap()` function.
   *
   * @remarks
   * This is useful for filtering the array that is passed to `append()`, `prepend()` or `setChildren()`.
   * See {@link Wrappable} type for the full definition.
   *
   * @param x an unknown value
   * @returns true if `x` is a string, Node (or its descendent), JJN (or its descendent)
   * @see {@link JJN.wrap} for converting Wrappable into wrappers.
   * @see {@link JJN.unwrap} for converting Wrappable into native nodes.
   */
  static isWrappable(x) {
    return isStr(x) || isInstance(x, Node) || isInstance(x, _JJN);
  }
  /**
   * Wraps a native DOM node or string into the most specific JJ wrapper available.
   *
   * @remarks
   * This factory function acts as an intelligent wrapper, inspecting the input type and returning the appropriate
   * subclass of `JJN` (e.g., `JJHE` for `HTMLElement`, `JJT` for `Text`, `JJSE` for `SVGElement`, etc.).
   * Strings are automatically converted to Text nodes wrapped in `JJT`.
   *
   * If the input is already a JJ wrapper, it is returned unchanged (no double-wrapping).
   * See the full implementation in src/wrappers/JJN.ts which extends this with support for internal wrapper types.
   *
   * @example
   * ```ts
   * const bodyWrapper = JJN.wrap(document.body) // Returns JJHE<HTMLBodyElement>
   * const textWrapper = JJN.wrap('Hello') // Returns JJT wrapping a new Text node
   * const existing = JJN.wrap(alreadyWrapped) // Returns alreadyWrapped unchanged
   * ```
   *
   * @param raw - The object to wrap. If it's already Wrapped, it'll be returned without any change. We don't double-wrap or clone it.
   * @returns The most granular Wrapped subclass instance. If the input is already wrapped, it'll be returned as is without cloning.
   * @see {@link JJN.from} for explicit base wrapper construction.
   * @see {@link JJN.unwrap} for the reverse conversion.
   */
  static wrap(raw) {
    if (isInstance(raw, _JJN)) {
      return raw;
    }
    if (isInstance(raw, Node)) {
      return new _JJN(raw);
    }
    return _JJN.from(document.createTextNode(toStr(raw)));
  }
  /**
   * Extracts the underlying native DOM node from a wrapper.
   *
   * @remarks
   * If the input is already a native Node, it is returned as is.
   * If the input is a JJ wrapper, its underlying node is returned.
   * Otherwise, the input is coerced into a Text node.
   * Plain objects are stringified with JSON when possible, and fall back to `String(...)`.
   *
   * @example
   * ```ts
   * const rawElement = JJN.unwrap(myJJHE) // Returns HTMLElement
   * ```
   *
   * @param obj - The value to unwrap.
   * @returns The underlying DOM node.
   * @see {@link JJN.wrap} for the reverse conversion.
   * @see {@link JJN.isWrappable} for pre-validation checks.
   */
  static unwrap(obj) {
    if (isInstance(obj, Node)) {
      return obj;
    }
    if (isInstance(obj, _JJN)) {
      return obj.ref;
    }
    return document.createTextNode(toStr(obj));
  }
  /**
   * Wraps an iterable object (e.g. an array of wrapped or DOM elements).
   *
   * @example
   * ```ts
   * const wrappedList = JJN.wrapAll(document.querySelectorAll('div'))
   * ```
   *
   * @param iterable - The iterable to wrap.
   * @returns An array of wrapped instances.
   * @see {@link JJN.wrap} for single-item wrapping.
   * @see {@link JJN.unwrapAll} for the reverse iterable conversion.
   */
  static wrapAll(iterable) {
    return Array.from(iterable, _JJN.wrap);
  }
  /**
   * Unwraps an iterable object (e.g. an array or HTMLCollection).
   *
   * @example
   * ```ts
   * const nodes = JJN.unwrapAll(wrappedList)
   * ```
   *
   * @param iterable - The iterable to unwrap.
   * @returns An array of native DOM nodes.
   * @see {@link JJN.unwrap} for single-item unwrapping.
   * @see {@link JJN.wrapAll} for iterable wrapping.
   */
  static unwrapAll(iterable) {
    return Array.from(iterable, _JJN.unwrap);
  }
  /**
   * Creates an instance of JJN.
   *
   * @param ref - The Node to wrap.
   * @throws {TypeError} If `ref` is not a Node.
   * @see {@link JJN.from} for the factory form.
   * @see {@link JJN.wrap} for automatic subtype wrapping.
   */
  constructor(ref) {
    if (!isInstance(ref, Node)) {
      throw typeErr("ref", "a DOM Node instance", ref);
    }
    super(ref);
  }
  getParent(required = false) {
    const { parentNode } = this.ref;
    if (parentNode) {
      return _JJN.wrap(parentNode);
    }
    if (required) {
      throw new ReferenceError("Node has no parent. Did you forget to attach it to the document?");
    }
    return null;
  }
  getChildren(required = false) {
    const children = _JJN.wrapAll(this.ref.childNodes);
    if (required && children.length === 0) {
      throw new ReferenceError("Node has no children. Did you forget to initialize or append them?");
    }
    return children;
  }
  /**
   * Clones the Node.
   *
   * @param deep - If true, clones the subtree.
   * @returns A new wrapped instance of the clone.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode | Node.cloneNode}
   */
  clone(deep) {
    return _JJN.wrap(this.ref.cloneNode(deep));
  }
  /**
   * Removes this node from its parent.
   *
   * @remarks
   * If the node has no parent, this method does nothing.
   *
   * @example
   * ```ts
   * const doc = JJD.from(document)
   * const el = JJHE.create('div')
   * doc.find('body', true).addChild(el)
   * el.rm()
   * ```
   *
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/removeChild | Node.removeChild}
   */
  rm() {
    const { parentNode } = this.ref;
    if (parentNode) {
      parentNode.removeChild(this.ref);
    }
    return this;
  }
  /**
   * Creates a Text node from a string and appends it to this Node.
   *
   * @remarks
   * This method is overridden in JJT to append to the existing text content instead.
   *
   * @example
   * ```ts
   * el.addText('Hello ')
   * el.addText('World')
   * // Behaves like document.createTextNode('Hello World') and appends it to el
   * // Falsy values are converted to their string representation, except for empty string which is added as is.
   * el.addText('Hello', '', 'world', null, undefined, '!!!') // Adds 6 text nodes with content 'Hello', '', 'world', 'null', 'undefined', and '!!!' respectively.
   * ```
   *
   * @param textArr - The text to add. The actual text that's added follows the rules in document.createTextNode() which is basically what you get from String()
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createTextNode | document.createTextNode}
   */
  addText(...textArr) {
    if (textArr) {
      this.ref.appendChild(document.createTextNode(textArr.join("")));
    }
    return this;
  }
};
function notNullish(x) {
  return x != null;
}
var JJNx = class extends JJN {
  find(selector, required = false) {
    const queryResult = this.ref.querySelector(selector);
    if (queryResult) {
      return JJN.wrap(queryResult);
    }
    if (required) {
      throw new ReferenceError(`No element matched query "${selector}"`);
    }
    return null;
  }
  /**
   * Finds all elements matching a selector within this Element.
   *
   * @example
   * ```ts
   * const items = el.findAll('li')
   * ```
   *
   * @param selector - The CSS selector.
   * @returns An array of wrapped elements.
   * @throws {TypeError} If selector is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/querySelectorAll | Element.querySelectorAll}
   */
  findAll(selector) {
    return JJN.wrapAll(this.ref.querySelectorAll(selector));
  }
  /**
   * Appends children to this Element.
   *
   * @example
   * ```ts
   * el.addChild(JJHE.tree('span', null, 'hello'))
   * ```
   *
   * @remarks
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @param children - The children to append.
   * @returns This instance for chaining.
   * @see {@link addChildren} for the array-based form.
   * @see {@link addChildMap} for mapping arrays into appended children.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/append | Element.append}
   */
  addChild(...children) {
    const nodes = JJN.unwrapAll(children.filter(notNullish));
    this.ref.append(...nodes);
    return this;
  }
  /**
   * Appends an array of children to this Element.
   *
   * @remarks
   * This is the array-based companion to {@link addChild}.
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @example
   * ```ts
   * el.addChildren([JJHE.tree('span', null, 'hello'), ' world'])
   * ```
   *
   * @param children - The children to append.
   * @returns This instance for chaining.
   * @throws {TypeError} If `children` is not an array.
   * @see {@link addChild} for the variadic form.
   * @see {@link addChildMap} for mapping arrays into appended children.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/append | Element.append}
   */
  addChildren(children) {
    if (!Array.isArray(children)) {
      throw typeErr("children", "an array of Wrappable", children);
    }
    return this.addChild(...children);
  }
  /**
   * Prepends children to this Element.
   *
   * @example
   * ```ts
   * el.preChild(JJHE.tree('span', null, 'first'))
   * ```
   *
   * @remarks
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @param children - The children to prepend.
   * @returns This instance for chaining.
   * @see {@link preChildren} for the array-based form.
   * @see {@link preChildMap} for mapping arrays into prepended children.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/prepend | Element.prepend}
   */
  preChild(...children) {
    const nodes = JJN.unwrapAll(children.filter(notNullish));
    this.ref.prepend(...nodes);
    return this;
  }
  /**
   * Prepends an array of children to this Element.
   *
   * @remarks
   * This is the array-based companion to {@link preChild}.
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @example
   * ```ts
   * el.preChildren([JJHE.tree('span', null, 'first'), ' child'])
   * ```
   *
   * @param children - The children to prepend.
   * @returns This instance for chaining.
   * @throws {TypeError} If `children` is not an array.
   * @see {@link preChild} for the variadic form.
   * @see {@link preChildMap} for mapping arrays into prepended children.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/prepend | Element.prepend}
   */
  preChildren(children) {
    if (!Array.isArray(children)) {
      throw typeErr("children", "an array of Wrappable", children);
    }
    return this.preChild(...children);
  }
  /**
   * Maps an array to children and appends them.
   *
   * @example
   * ```ts
   * node.addChildMap(['a', 'b'], item => JJHE.tree('li', null, item))
   * ```
   *
   * @remarks
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @param array - The source array.
   * @param mapFn - The mapping function returning a Wrappable.
   * @returns This instance for chaining.
   * @throws {TypeError} If `array` is not an array.
   * @throws {Error} If mapping the array or appending the children fails.
   * @see {@link addChild} for directly appending variadic children.
   * @see {@link addChildren} for appending a pre-built array of children.
   */
  addChildMap(array, mapFn) {
    if (!Array.isArray(array)) {
      throw typeErr("array", "an array", array);
    }
    try {
      return this.addChildren(array.map(mapFn));
    } catch (cause) {
      throw new Error("Failed to map array to children", { cause });
    }
  }
  /**
   * Maps an array to children and prepends them.
   *
   * @example
   * ```ts
   * node.preChildMap(['a', 'b'], item => JJHE.create('li').setText(item))
   * ```
   *
   * @remarks
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @param array - The source array.
   * @param mapFn - The mapping function.
   * @returns This instance for chaining.
   * @throws {TypeError} If `array` is not an array.
   * @throws {Error} If mapping the array or prepending the children fails.
   * @see {@link preChild} for directly prepending variadic children.
   * @see {@link preChildren} for prepending a pre-built array of children.
   */
  preChildMap(array, mapFn) {
    if (!Array.isArray(array)) {
      throw typeErr("array", "an array", array);
    }
    try {
      return this.preChildren(array.map(mapFn));
    } catch (cause) {
      throw new Error("Failed to map array to children", { cause });
    }
  }
  /**
   * Replaces the existing children of an Element with new children.
   *
   * @remarks
   * If no children are provided, it empties the Element.
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @example
   * ```ts
   * el.setChild(JJHE.tree('p', null, 'New Content'))
   * ```
   * @param children - The children to replace with.
   * @returns This instance for chaining.
   * @see {@link setChildren} for the array-based form.
   * @see {@link setChildMap} for mapping arrays into replacement children.
   * @see {@link empty} for clearing all children.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/replaceChildren | Element.replaceChildren}
   */
  setChild(...children) {
    if (children.length === 0) {
      this.ref.replaceChildren();
    } else {
      const nodes = JJN.unwrapAll(children.filter(notNullish));
      this.ref.replaceChildren(...nodes);
    }
    return this;
  }
  /**
   * Replaces the existing children of an Element with an array of children.
   *
   * @remarks
   * This is the array-based companion to {@link setChild}.
   * Passing an empty array empties the Element.
   * To make template codes easier, this function ignores nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   *
   * @example
   * ```ts
   * el.setChildren([JJHE.tree('p', null, 'New Content')])
   * ```
   *
   * @param children - The children to replace with.
   * @returns This instance for chaining.
   * @throws {TypeError} If `children` is not an array of Wrappable.
   * @see {@link setChild} for the variadic form.
   * @see {@link setChildMap} for mapping arrays into replacement children.
   * @see {@link empty} for clearing all children.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/replaceChildren | Element.replaceChildren}
   */
  setChildren(children) {
    if (!Array.isArray(children)) {
      throw typeErr("children", "an array of Wrappable", children);
    }
    return this.setChild(...children);
  }
  /**
   * Maps an array to children and replaces the existing children with the result.
   *
   * @remarks
   * This is the mapping companion to {@link setChildren}.
   * To make template codes easier, this function ignores mapped nullish children (`null` and `undefined`).
   * Other non-node values are coerced into Text nodes.
   * Errors thrown by the mapping function or child replacement are wrapped with a higher-level error that preserves the original cause.
   *
   * @example
   * ```ts
   * node.setChildMap(['a', 'b'], item => JJHE.tree('li', null, item))
   * ```
   *
   * @param array - The source array.
   * @param mapFn - The mapping function returning a Wrappable.
   * @returns This instance for chaining.
   * @throws {TypeError} If `array` is not an array of Wrappable.
   * @throws {Error} If mapping the array or replacing the children fails.
   * @see {@link setChildren} for replacing children from a pre-built array.
   * @see {@link setChild} for the variadic replacement form.
   * @see {@link empty} for clearing all children without replacements.
   */
  setChildMap(array, mapFn) {
    if (!Array.isArray(array)) {
      throw typeErr("array", "an array of Wrappable", array);
    }
    try {
      return this.setChildren(array.map(mapFn));
    } catch (cause) {
      throw new Error("Failed to map array to children", { cause });
    }
  }
  /**
   * Removes all children from this Element.
   *
   * @example
   * ```ts
   * el.empty()
   * ```
   *
   * @returns This instance for chaining.
   * @see {@link setChild} for replacing children with a variadic list.
   * @see {@link setChildren} for replacing children with an array.
   * @see {@link setChildMap} for replacing children from mapped input.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/replaceChildren | Element.setChildren}
   */
  empty() {
    return this.setChild();
  }
  /**
   * Clones and appends template-like input to this node.
   *
   * @remarks
   * Supports HTML strings, native template sources, native Nodes, and any JJ wrapper via {@link JJN}.
   * Wrapper inputs are unwrapped and cloned before append.
   *
   * @param template - The template source to clone and append.
   * @returns This instance for chaining.
   * @throws {TypeError} If the template type is unsupported or a Promise was passed.
   * @see {@link setTemplate} for replacing existing children with a cloned template.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createRange | Document.createRange}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLTemplateElement | HTMLTemplateElement}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment | DocumentFragment}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement | HTMLElement}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode | Node.cloneNode}
   */
  addTemplate(template) {
    if (isStr(template)) {
      return this.addChild(document.createRange().createContextualFragment(template));
    }
    if (isInstance(template, DocumentFragment) || isInstance(template, HTMLElement)) {
      return this.addChild(
        isInstance(template, HTMLTemplateElement) ? template.content.cloneNode(true) : template.cloneNode(true)
      );
    }
    if (isInstance(template, Node)) {
      return this.addChild(template.cloneNode(true));
    }
    if (isInstance(template, JJN)) {
      return this.addTemplate(template.ref);
    }
    if (isInstance(template, Promise)) {
      throw typeErr(
        "template",
        "not a Promise",
        template,
        "Templates must be provided synchronously. Did you forget to await?"
      );
    }
    throw typeErr(
      "template",
      "a string, Node, DocumentFragment, HTMLElement, JJDF, or JJHE",
      template,
      "Pass an HTML string, a DOM template/fragment/element, or a JJ wrapper."
    );
  }
  /**
   * Clones and sets template-like input as the only children of this node.
   *
   * @remarks
   * Supports HTML strings, native template sources, native Nodes, and any JJ wrapper via {@link JJN}.
   * Wrapper inputs are unwrapped and cloned before set.
   *
   * @example
   * ```ts
   * el.setTemplate('<p>New Content</p>')
   * ```
   * @param template - The template source to clone and set.
   * @returns This instance for chaining.
   * @see {@link addTemplate}
   * @see {@link empty} for clearing children without adding a replacement template.
   */
  setTemplate(template) {
    return this.empty().addTemplate(template);
  }
};
var JJDF = class _JJDF extends JJNx {
  /**
   * Creates a JJDF instance from a DocumentFragment reference.
   *
   * @remarks
   * Use {@link JJDF.create} to create a new empty DocumentFragment.
   * For other Node types, use {@link JJN.from} or the specific wrapper type.
   *
   * @example
   * ```ts
   * const frag = JJDF.from(myFrag)
   * ```
   *
   * @param ref - The DocumentFragment instance.
   * @returns A new JJDF instance.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment | DocumentFragment}
   */
  static from(ref) {
    return new _JJDF(ref);
  }
  /**
   * Creates a new empty JJDF instance (wraps a new DocumentFragment).
   *
   * @remarks
   * To wrap an existing DocumentFragment, use {@link JJDF.from}.
   *
   * @example
   * ```ts
   * const frag = JJDF.create()
   * ```
   *
   * @returns A new JJDF instance.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createDocumentFragment | document.createDocumentFragment}
   */
  static create() {
    return new _JJDF(document.createDocumentFragment());
  }
  /**
   * Creates an instance of JJDF.
   *
   * @param ref - The DocumentFragment instance to wrap.
   * @throws {TypeError} If `ref` is not a DocumentFragment.
   * @see {@link JJDF.from} to wrap an existing fragment.
   * @see {@link JJDF.create} to create a new empty fragment.
   */
  constructor(ref) {
    if (!isInstance(ref, DocumentFragment)) {
      throw typeErr("ref", "a DocumentFragment", ref, "Use JJDF.from(documentFragment) to create an instance.");
    }
    super(ref);
  }
};
var JJSR = class _JJSR extends JJDF {
  /**
   * Creates a JJSR instance from a ShadowRoot reference.
   *
   * @remarks
   * Typically created via `element.attachShadow({ mode: 'open' })` and passed here to be wrapped.
   * Inherits from {@link JJDF} (DocumentFragment), so you can use all fragment methods like `find()`, `findAll()`, etc.
   *
   * @example
   * ```ts
   * const shadow = JJSR.from(element.shadowRoot)
   * ```
   *
   * @param shadowRoot - The ShadowRoot instance.
   * @returns A new JJSR instance.
   * @see {@link JJHE.setShadow} for attaching and initializing a shadow root from a host element.
   * @see {@link JJSR.constructor} for validation behavior.
   */
  static from(shadowRoot) {
    return new _JJSR(shadowRoot);
  }
  /**
   * Creates an instance of JJSR.
   *
   * @param shadowRoot - The ShadowRoot to wrap.
   * @throws {TypeError} If `shadowRoot` is not a ShadowRoot.
   * @see {@link JJSR.from} to wrap an existing ShadowRoot
   */
  constructor(shadowRoot) {
    if (!isInstance(shadowRoot, ShadowRoot)) {
      throw typeErr(
        "shadowRoot",
        "a ShadowRoot instance",
        shadowRoot,
        'Use JJHE.from(element).setShadow() or element.attachShadow({ mode: "open" }).'
      );
    }
    super(shadowRoot);
  }
  /**
   * Initializes the ShadowRoot with template content and optional styles.
   *
   * @example
   * ```ts
   * shadow.init('<p>Hello</p>', 'p { color: red; }')
   * ```
   *
   * @param template - The template content to clone into the shadow root.
   * @param styles - Optional styles to add to the shadow root.
   * @returns This instance for chaining.
   * @throws {Error} If the template or styles cannot be applied.
   * @see {@link JJDF.addTemplate} for supported template inputs.
   * @see {@link addStyle} for stylesheet handling.
   */
  init(template, ...styles) {
    this.addTemplate(template).addStyle(...styles);
    return this;
  }
  /**
   * Gets the inner HTML of the ShadowRoot.
   *
   * @returns The inner HTML string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML | Element.innerHTML}
   */
  getHTML() {
    return this.ref.innerHTML;
  }
  /**
   * Sets the inner HTML of the ShadowRoot.
   *
   * @example
   * ```ts
   * shadow.setHTML('<p>Hello</p>', true)
   * ```
   *
   * @param html - The HTML string to set, or null/undefined to clear.
   * @param unsafe - explicit opt-in to set innerHTML. must be true if html is provided.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML | Element.innerHTML}
   */
  setHTML(html, unsafe) {
    if (html && unsafe !== true) {
      throw new Error(
        `Setting innerHTML is unsafe. Pass true as the second argument to confirm you know what you are doing.`
      );
    }
    this.ref.innerHTML = html ?? "";
    return this;
  }
  /**
   * Adds constructed stylesheets to the ShadowRoot.
   *
   * @remarks
   * Although this function accepts CSS strings, it converts them to CSSStyleSheet synchronously which has a performance penalty.
   * For better performance, create CSSStyleSheet instances in advance.
   *
   * @example
   * ```ts
   * const sheet = new CSSStyleSheet()
   * sheet.replaceSync('p { color: red; }')
   * shadow.addStyle(sheet)
   * ```
   *
   * @param styles - The stylesheets to add.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets | ShadowRoot.adoptedStyleSheets}
   */
  addStyle(...styles) {
    if (styles.length) {
      const cssStyleSheets = [];
      try {
        for (const sheet of styles) {
          if (isInstance(sheet, CSSStyleSheet)) {
            cssStyleSheets.push(sheet);
          } else if (isStr(sheet)) {
            const cssSheet = new CSSStyleSheet();
            cssSheet.replaceSync(sheet);
            cssStyleSheets.push(cssSheet);
          } else {
            throw typeErr(
              "styleSheets",
              "CSSStyleSheet instances or CSS strings",
              sheet,
              "Pass a CSS string or a stylesheet created with `new CSSStyleSheet()`."
            );
          }
        }
      } catch (cause) {
        throw new Error(`Failed to create CSSStyleSheet from provided styles.`, { cause });
      }
      this.ref.adoptedStyleSheets.push(...cssStyleSheets);
    }
    return this;
  }
};
var JJE = class _JJE extends JJNx {
  /**
   * Creates a JJE instance from an Element reference.
   *
   * @remarks
   * Use this factory method to wrap an existing Element. For creating new Elements,
   * use the specific wrapper type: {@link JJHE.create}, {@link JJSE.create}, or {@link JJME.create}.
   *
   * @example
   * ```ts
   * const el = JJE.from(document.querySelector('.my-class'))
   * ```
   *
   * @param ref - The Element instance.
   * @returns A new JJE instance.
   * @see {@link JJHE.create} for creating HTMLElements
   * @see {@link JJSE.create} for creating SVGElements
   * @see {@link JJME.create} for creating MathMLElements
   */
  static from(ref) {
    return new _JJE(ref);
  }
  /**
   * Creates an instance of JJE.
   *
   * @param ref - The Element to wrap.
   * @throws {TypeError} If `ref` is not an Element.
   * @see {@link JJHE} for wrapping HTMLElements
   * @see {@link JJSE} for wrapping SVGElements
   * @see {@link JJME} for wrapping MathMLElements
   */
  constructor(ref) {
    if (!isInstance(ref, Element)) {
      throw typeErr(
        "ref",
        "an Element instance",
        ref,
        "Use JJHE.from(), JJSE.from(), or JJME.from() with the appropriate Element type."
      );
    }
    super(ref);
  }
  /**
   * Gets the value of an attribute.
   *
   * @param name - The name of the attribute.
   * @returns The attribute value, or null if not present.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getAttribute | Element.getAttribute}
   */
  getAttr(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return this.ref.getAttribute(name);
  }
  /**
   * Checks if an attribute exists.
   *
   * @param name - The name of the attribute.
   * @returns `true` if the attribute exists, otherwise `false`.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/hasAttribute | Element.hasAttribute}
   */
  hasAttr(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return this.ref.hasAttribute(name);
  }
  /**
   * Sets a single attribute on the Element.
   *
   * @example
   * ```ts
   * el.setAttr('id', 'my-id')
   * el.setAttr('x', 50)  // Numbers are automatically converted
   * ```
   *
   * @throws {TypeError} If arguments are invalid types.
   * @see {@link setAttrs} for setting multiple attributes at once.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/setAttribute | Element.setAttribute}
   */
  setAttr(name, value) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    this.ref.setAttribute(name, value);
    return this;
  }
  /**
   * Sets multiple attributes from an object, or no-ops for nullish input.
   *
   * @remarks
   * This helper is useful for optional attribute bags in builder APIs.
   * - `null` or `undefined`: does nothing and returns `this`
   * - plain object: sets each attribute on the element
   * - anything else: throws `TypeError`
   *
   * @example
   * ```ts
   * el.setAttrs({ id: 'app', role: 'main' })
   * el.setAttrs(null) // no-op
   * ```
   *
   * @param attributes - Attributes object or nullish to skip.
   * @returns This instance for chaining.
   * @throws {TypeError} If `attributes` is not nullish and not a plain object.
   * @see {@link setAttr} for setting a single attribute.
   */
  setAttrs(attributes) {
    if (attributes == null) {
      return this;
    }
    if (!isObj(attributes)) {
      throw typeErr(
        "attributes",
        "a plain object",
        attributes,
        'Pass null/undefined or an object like { id: "app" }.'
      );
    }
    for (const [name, value] of Object.entries(attributes)) {
      this.setAttr(name, value);
    }
    return this;
  }
  /**
   * Removes one or more attributes from the Element.
   *
   * @example
   * ```ts
   * el.rmAttr('disabled')  // Remove single
   * el.rmAttr('hidden', 'aria-hidden')  // Remove multiple
   * ```
   *
   * @param names - The name(s) of the attribute(s) to remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If any name is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/removeAttribute | Element.removeAttribute}
   */
  rmAttr(...names) {
    for (const name of names) {
      if (!isStr(name)) {
        throw typeErr("name", "a string", name);
      }
      this.ref.removeAttribute(name);
    }
    return this;
  }
  /**
   * Conditionally sets or removes a boolean-style (presence-based) attribute, or
   * auto-toggles it when called without a `force` value.
   *
   * @remarks
   * HTML boolean attributes (e.g. `disabled`, `hidden`, `checked`, `readonly`, `required`)
   * are active whenever they are **present**, regardless of their value.
   *
   * This method has two modes:
   *
   * **Explicit mode** — pass any `force` value other than `undefined`:
   * - Truthy `force` → sets the attribute to `""` (presence = active).
   * - Falsy `force` (e.g. `false`, `null`, `0`, `""`) → removes the attribute. For `undefined`, see auto mode.
   *
   * **Auto mode** — omit `force` entirely (i.e. call with one argument) or pass `undefined` explicitly:
   * - Delegates to the native `Element.toggleAttribute()`: removes the attribute if
   *   present, adds it (as `""`) if absent. Useful for click handlers and event
   *   callbacks where you just want to flip the current state.
   *
   * > **Warning:** Passing `undefined` explicitly — `swAttr('disabled', undefined)` —
   * > is treated as **auto mode**, not as an explicit remove. If you need to
   * > unconditionally remove the attribute, use {@link rmAttr} instead.
   *
   * ARIA attributes are not HTML boolean attributes. Even boolean-like ARIA states
   * such as `aria-hidden`, `aria-disabled`, and `aria-readonly` require explicit
   * string values like `"true"` or `"false"`, so they should be managed with
   * {@link setAriaAttr} / {@link rmAriaAttr}, not with `swAttr()`.
   *
   * For other attributes that carry a meaningful string value (e.g.
   * `dir="rtl"`, `hidden="until-found"`), use {@link setAttr} and {@link rmAttr} directly.
   *
   * @example
   * ```ts
   * // Explicit mode — driven by a runtime condition (most common)
   * btn.swAttr('disabled', !isReady)
   * panel.swAttr('hidden', !isExpanded)
   * input.swAttr('readonly', isReadonly)
   *
   * // Not for ARIA — these need explicit string values
   * dialog.setAriaAttr('hidden', 'true')
   * button.setAriaAttr('disabled', 'false')
   *
   * // Auto mode — flip current state (no condition required)
   * btn.on('click', () => btn.swAttr('disabled'))
   *
   * // ⚠️ Watch out: passing undefined is NOT an explicit remove
   * swAttr('disabled', undefined) // → auto mode, NOT rmAttr!
   * ```
   *
   * @param name - The attribute name.
   * @param force - If omitted or `undefined`: auto-toggle. Truthy: add. Falsy (not `undefined`): remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link setAttr} for setting a non-ARIA attribute with a specific string value.
   * @see {@link setAriaAttr} for ARIA attributes that require explicit values.
   * @see {@link rmAriaAttr} for unconditionally removing an ARIA attribute.
   * @see {@link rmAttr} for unconditionally removing an attribute.
   * @see {@link swClass} for the class-list equivalent.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/toggleAttribute | Element.toggleAttribute}
   */
  swAttr(name, force) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    this.ref.toggleAttribute(name, force);
    return this;
  }
  /**
   * Gets the value of an ARIA attribute.
   *
   * @remarks
   * Automatically prepends `aria-` to the name.
   *
   * @example
   * ```ts
   * el.getAriaAttr('label') // gets 'aria-label'
   * ```
   *
   * @param name - The ARIA attribute suffix (e.g., 'label' for 'aria-label').
   * @returns The attribute value, or null if not present.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes | ARIA Attributes}
   */
  getAriaAttr(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return this.ref.getAttribute(`aria-${name}`);
  }
  /**
   * Checks if an ARIA attribute exists.
   *
   * @param name - The ARIA attribute suffix.
   * @returns `true` if the attribute exists.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link getAriaAttr} for reading ARIA values.
   * @see {@link setAriaAttr} for setting ARIA values.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes | ARIA Attributes}
   */
  hasAriaAttr(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return this.ref.hasAttribute(`aria-${name}`);
  }
  /**
   * Sets a single ARIA attribute on the Element.
   *
   * @example
   * ```ts
   * el.setAriaAttr('hidden', 'true')
   * el.setAriaAttr('level', 2)
   * ```
   *
   * @param name - The ARIA attribute suffix.
   * @param value - The value to assign.
   * @returns This instance for chaining.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link setAriaAttrs} for setting multiple ARIA attributes at once.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes | ARIA Attributes}
   */
  setAriaAttr(name, value) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    this.ref.setAttribute(`aria-${name}`, value);
    return this;
  }
  /**
   * Sets multiple ARIA attributes from an object, or no-ops for nullish input.
   *
   * @remarks
   * This helper is useful for optional ARIA attribute bags in builder APIs.
   * - `null` or `undefined`: does nothing and returns `this`
   * - plain object: sets each ARIA attribute on the element
   * - anything else: throws `TypeError`
   *
   * @example
   * ```ts
   * el.setAriaAttrs({ label: 'Close', hidden: 'false' })
   * el.setAriaAttrs(null) // no-op
   * ```
   *
   * @param attributes - ARIA attributes object or nullish to skip.
   * @returns This instance for chaining.
   * @throws {TypeError} If `attributes` is not nullish and not a plain object.
   * @see {@link setAriaAttr} for setting a single ARIA attribute.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes | ARIA Attributes}
   */
  setAriaAttrs(attributes) {
    if (attributes == null) {
      return this;
    }
    if (!isObj(attributes)) {
      throw typeErr(
        "attributes",
        "a plain object",
        attributes,
        'Pass null/undefined or an object like { hidden: "true" }.'
      );
    }
    try {
      for (const [name, value] of Object.entries(attributes)) {
        this.setAriaAttr(name, value);
      }
    } catch (cause) {
      throw new Error(`Failed to set some ARIA attributes from object: ${JSON.stringify(attributes)}.`, { cause });
    }
    return this;
  }
  /**
   * Removes one or more ARIA attributes from the Element.
   *
   * @example
   * ```ts
   * el.rmAriaAttr('hidden')  // Remove single
   * el.rmAriaAttr('label', 'hidden')  // Remove multiple
   * ```
   *
   * @param names - The ARIA attribute suffix(es) to remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If any name is not a string.
   * @see {@link setAriaAttr} for setting a single ARIA attribute.
   * @see {@link setAriaAttrs} for setting multiple ARIA attributes.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/removeAttribute | Element.removeAttribute}
   */
  rmAriaAttr(...names) {
    try {
      for (const name of names) {
        if (!isStr(name)) {
          throw typeErr("name", "a string", name);
        }
        this.ref.removeAttribute(`aria-${name}`);
      }
    } catch (cause) {
      throw new Error(`Failed to remove some ARIA attributes: ${JSON.stringify(names)}.`, { cause });
    }
    return this;
  }
  /**
   * Gets the class attribute.
   *
   * @returns The class attribute value, or null if not present.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/className | Element.className}
   */
  getClass() {
    return this.getAttr("class");
  }
  /**
   * Sets the class attribute.
   *
   * @remarks
   * To remove all classes, pass an empty string: `setClass('')`
   *
   * @example
   * ```ts
   * el.setClass('btn btn-primary')
   * el.setClass('')
   * ```
   *
   * @param className - The full class attribute value.
   * @returns This instance for chaining.
   * @throws {TypeError} If `className` is not a string.
   * @see {@link setClasses} for conditional class maps.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/className | Element.className}
   */
  setClass(className) {
    if (!isStr(className)) {
      throw typeErr("className", "a string", className);
    }
    return this.setAttr("class", className);
  }
  /**
   * Conditionally adds or removes classes from an object map, or no-ops for nullish input.
   *
   * @remarks
   * - `null` or `undefined`: does nothing and returns `this`
   * - plain object: truthy values add a class, falsy values remove it
   * - anything else: throws `TypeError`
   *
   * @example
   * ```ts
   * el.setClasses({
   *   active: true,
   *   disabled: false,
   *   highlight: isHighlighted,
   * })
   * el.setClasses(null) // no-op
   * ```
   *
   * @param classMap - Conditional class map or nullish to skip.
   * @returns This instance for chaining.
   * @throws {TypeError} If `classMap` is not nullish and not a plain object.
   * @see {@link setClass} for replacing the full class attribute.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   */
  setClasses(classMap) {
    if (classMap == null) {
      return this;
    }
    if (!isObj(classMap)) {
      throw typeErr(
        "classMap",
        "a plain object",
        classMap,
        "Pass null/undefined or an object like { active: true }."
      );
    }
    try {
      for (const [className, condition] of Object.entries(classMap)) {
        if (condition) {
          this.addClass(className);
        } else {
          this.rmClass(className);
        }
      }
    } catch (cause) {
      throw new Error(`Failed to set some classes from object: ${JSON.stringify(classMap)}.`, { cause });
    }
    return this;
  }
  /**
   * Adds one or more classes to the Element.
   *
   * @example
   * ```ts
   * el.addClass('btn', 'btn-primary')
   * ```
   *
   * @param classNames - The classes to add.
   * @returns This instance for chaining.
   * @throws {TypeError} If any class name is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/add | DOMTokenList.add}
   */
  addClass(...classNames) {
    for (const className of classNames) {
      if (!isStr(className)) {
        throw typeErr("className", "a string", className);
      }
    }
    this.ref.classList.add(...classNames);
    return this;
  }
  /**
   * Adds multiple classes from an array of class names.
   *
   * @example
   * ```ts
   * el.addClasses(['btn', 'btn-primary'])
   * ```
   *
   * @param classNames - The classes to add.
   * @returns This instance for chaining.
   * @throws {TypeError} If `classNames` is not an array.
   * @throws {TypeError} If any class name in `classNames` is not a string.
   * @see {@link addClass} for adding one or more classes via rest arguments.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/add | DOMTokenList.add}
   */
  addClasses(classNames) {
    if (!Array.isArray(classNames)) {
      throw typeErr("classNames", "an array of strings", classNames);
    }
    return this.addClass(...classNames);
  }
  /**
   * Removes one or more classes from the Element.
   *
   * @example
   * ```ts
   * el.rmClass('active')  // Remove single
   * el.rmClass('btn', 'btn-primary')  // Remove multiple
   * ```
   *
   * @param classNames - The classes to remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If any class name is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/remove | DOMTokenList.remove}
   */
  rmClass(...classNames) {
    for (const className of classNames) {
      if (!isStr(className)) {
        throw typeErr("className", "a string", className);
      }
    }
    this.ref.classList.remove(...classNames);
    return this;
  }
  /**
   * Removes multiple classes from an array of class names.
   *
   * @example
   * ```ts
   * el.rmClasses(['btn', 'btn-primary'])
   * ```
   *
   * @param classNames - The classes to remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If `classNames` is not an array.
   * @throws {TypeError} If any class name in `classNames` is not a string.
   * @see {@link rmClass} for removing one or more classes via rest arguments.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/remove | DOMTokenList.remove}
   */
  rmClasses(classNames) {
    if (!Array.isArray(classNames)) {
      throw typeErr("classNames", "an array of strings", classNames);
    }
    return this.rmClass(...classNames);
  }
  /**
   * Checks if the Element has a specific class.
   *
   * @param className - The class to check for.
   * @returns `true` if the element has the class.
   * @throws {TypeError} If `className` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/contains | DOMTokenList.contains}
   */
  hasClass(className) {
    if (!isStr(className)) {
      throw typeErr("className", "a string", className);
    }
    return this.ref.classList.contains(className);
  }
  /**
   * Conditionally adds or removes a single class, or auto-toggles it when called
   * without a `force` value.
   *
   * @remarks
   * This method has two modes, mirroring the behavior of {@link swAttr}:
   *
   * **Explicit mode** — pass any `force` value other than `undefined`:
   * - Truthy `force` → adds the class.
   * - Falsy `force` (e.g. `false`, `null`, `0`, `""`) → removes the class.
   *
   * **Auto mode** — omit `force` entirely (i.e. call with one argument):
   * - Delegates to the native `DOMTokenList.toggle()`: removes the class if present,
   *   adds it if absent. Useful for click handlers and event callbacks where you just
   *   want to flip the current state.
   *
   * > **Warning:** Passing `undefined` explicitly — `swClass('foo', undefined)` —
   * > is treated as **auto mode**, not as an explicit remove. If you need to
   * > unconditionally remove a class, use {@link rmClass} instead.
   *
   * To toggle multiple classes from a condition map in a single call, use {@link setClasses}.
   *
   * @example
   * ```ts
   * // Explicit mode — driven by a runtime condition (most common)
   * el.swClass('is-expanded', isExpanded)
   * el.swClass('is-loading', isPending)
   *
   * // Auto mode — flip current state (no condition required)
   * btn.on('click', () => btn.swClass('is-active'))
   *
   * // ⚠️ Watch out: passing undefined is NOT an explicit remove
   * swClass('foo', undefined) // → auto mode, NOT rmClass!
   * ```
   *
   * @param className - The class to add or remove.
   * @param force - If omitted or `undefined`: auto-toggle. Truthy: add. Falsy (not `undefined`): remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If `className` is not a string.
   * @see {@link setClasses} for toggling multiple classes at once via a condition map.
   * @see {@link addClass} for unconditionally adding a class.
   * @see {@link rmClass} for unconditionally removing a class.
   * @see {@link swAttr} for the attribute equivalent.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/classList | Element.classList}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/toggle | DOMTokenList.toggle}
   */
  swClass(className, force) {
    if (!isStr(className)) {
      throw typeErr("className", "a string", className);
    }
    this.ref.classList.toggle(className, force);
    return this;
  }
  /**
   * Finds the closest ancestor (or self) that matches a CSS selector.
   *
   * @remarks
   * Returns `null` when no matching ancestor is found.
   *
   * @example
   * ```ts
   * const button = JJE.from(document.querySelector('button'))
   * const card = button.closest('.card')
   * if (card) {
   *     card.addClass('has-action')
   * }
   * ```
   *
   * @param selector - The CSS selector to search for.
   * @returns A JJE wrapping the closest match, or null when none exists.
   * @throws {TypeError} If `selector` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/closest | Element.closest}
   */
  closest(selector) {
    if (!isStr(selector)) {
      throw typeErr("selector", "a string", selector);
    }
    const match = this.ref.closest(selector);
    return match ? _JJE.wrap(match) : null;
  }
  /**
  
       * Hides the Element by setting the `hidden` attribute and `aria-hidden="true"`.
       *
       * @returns This instance for chaining.
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/hidden | hidden attribute}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-hidden | aria-hidden}
       */
  hide() {
    return this.setAttr("hidden", "").setAttr("aria-hidden", "true");
  }
  /**
   * Shows the Element by removing the `hidden` and `aria-hidden` attributes.
   *
   * @returns This instance for chaining.
   * @see {@link hide} for the inverse operation.
   * @see {@link rmAttr} for generic attribute removal.
   */
  show() {
    return this.rmAttr("hidden", "aria-hidden");
  }
  /**
   * Disables the Element by setting the `disabled` attribute and `aria-disabled="true"`.
   *
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/disabled | disabled attribute}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-disabled | aria-disabled}
   */
  disable() {
    return this.setAttr("disabled", "").setAttr("aria-disabled", "true");
  }
  /**
   * Enables the Element by removing the `disabled` and `aria-disabled` attributes.
   *
   * @returns This instance for chaining.
   * @see {@link disable} for the inverse operation.
   * @see {@link rmAttr} for generic attribute removal.
   */
  enable() {
    return this.rmAttr("disabled", "aria-disabled");
  }
  /**
   * Gets the text content of the Element.
   *
   * @remarks
   * This method operates on `textContent`. The method name is kept short for convenience.
   *
   * For HTML-only rendering-aware text behavior (layout-aware whitespace and line breaks),
   * use `jjEl.ref.innerText` on `JJHE` wrappers.
   *
   * This method exists on element wrappers (`JJE`, `JJHE`, `JJSE`, `JJME`) and does not
   * apply to `JJD` (Document wrapper). Per MDN, `Document.textContent` and
   * `DocumentType.textContent` are `null`; for full document text, use one of the following:
   * - `document.documentElement.textContent`
   * - `jjDoc.ref.documentElement.textContent`
   * - `JJE.from(document.documentElement).getText()`.
   *
   * @returns The text content, or an empty string when `textContent` is null.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent | Node.textContent}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText | HTMLElement.innerText}
   */
  getText() {
    return this.ref.textContent ?? "";
  }
  /**
   * Sets the text content of the Element.
   *
   * @remarks
   * This method operates on `textContent`. The method name is kept short for convenience.
   * Pass an empty string, `null`, or `undefined` to clear the content.
   * Numbers and booleans are automatically converted to strings by the DOM.
   *
   * For HTML-only rendering-aware text behavior (for example preserving line breaks via
   * `innerText`), use `jjEl.ref.innerText = 'Hello\nworld!'` on a `JJHE` wrapper.
   *
   * @param text - The text to set, or null/undefined to clear.
   * @returns This instance for chaining.
   * @see {@link getText} for reading text content.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent | Node.textContent}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText | HTMLElement.innerText}
   */
  setText(text) {
    this.ref.textContent = text;
    return this;
  }
  /**
   * Gets the inner HTML of the Element.
   *
   * @remarks
   * This method operates on `innerHTML`. The method name is kept short for convenience.
   *
   * @returns The inner HTML string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML | Element.innerHTML}
   */
  getHTML() {
    return this.ref.innerHTML;
  }
  /**
   * Sets the inner HTML of the Element.
   *
   * @remarks
   * This method operates on `innerHTML`. The method name is kept short for convenience.
   * Pass an empty string, `null`, or `undefined` to clear the content.
   *
   * @param html - The HTML string to set, or null/undefined to clear.
   * @param unsafe - explicit opt-in to set innerHTML. must be true if html is provided.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML | Element.innerHTML}
   */
  setHTML(html, unsafe) {
    if (html && unsafe !== true) {
      throw new Error(
        `Setting innerHTML is unsafe. Pass true as the second argument to confirm you know what you are doing.`
      );
    }
    this.ref.innerHTML = html ?? "";
    return this;
  }
  /**
   * Attaches a Shadow DOM to the Element if it's not already attached.
   *
   * @remarks
   * You can't attach a shadow root to every type of element. There are some that can't have a
   * shadow DOM for security reasons (for example `<a>`).
   *
   * @param mode - The encapsulation mode ('open' or 'closed'). Defaults to 'open'.
   * @returns This instance for chaining.
   * @throws {DOMException} If the element cannot have a shadow root. See {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow | Element.attachShadow} for more details.
   * @throws {Error} If the shadow DOM is already attached but with another mode.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow | Element.attachShadow}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets | ShadowRoot.adoptedStyleSheets}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/adoptedStyleSheets | Document.adoptedStyleSheets}
   */
  setShadow(mode = "open") {
    const { shadowRoot } = this.ref;
    if (!shadowRoot) {
      this.ref.attachShadow({ mode });
    } else if (shadowRoot.mode !== mode) {
      throw new Error(
        `Element already has a shadow root with mode "${shadowRoot.mode}". Cannot attach another with mode "${mode}".`
      );
    }
    return this;
  }
  /**
   * Initializes an already-attached Shadow DOM with template content and optional styles.
   *
   * @remarks
   * This method expects the shadow root to already exist.
   * You would typically call `setShadow()` in the custom component constructor and then
   * perform initialization in `connectedCallback()`.
   *
   * @example
   * ```ts
   * const host = JJHE.from(this).setShadow('open')
   * host.initShadow(await templatePromise, await stylePromise)
   * ```
   *
   * @param template - The template content to clone into the shadow root.
   * @param styles - Optional styles to add to the shadow root.
   * @returns This instance for chaining.
   * @throws {ReferenceError} If the element does not have a shadow root yet.
   * @throws {Error} If it fails to initialize the shadow DOM with the provided template or styles.
   * @see {@link setShadow} for attaching the shadow root first.
   * @see {@link JJSR.init} for the underlying shadow-root initialization helper.
   */
  initShadow(template, ...styles) {
    try {
      this.getShadow(true).init(template, ...styles);
    } catch (cause) {
      throw new Error(`Failed to initialize shadow DOM`, { cause });
    }
    return this;
  }
  getShadow(required = false) {
    const shadowRoot = this.ref.shadowRoot;
    if (shadowRoot) {
      return new JJSR(shadowRoot);
    }
    if (required) {
      throw new ReferenceError("No shadow root found on this element. Did you forget to call setShadow() first?");
    }
    return null;
  }
};
var JJEx = class extends JJE {
  /**
   * Gets the value of a single inline style property.
   *
   * @example
   * ```ts
   * const display = el.getStyle('display')
   * ```
   *
   * @param name - The CSS property name (kebab-case recommended).
   * @returns The property value, or an empty string when it is not set.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/style | HTMLElement.style}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/getPropertyValue | CSSStyleDeclaration.getPropertyValue}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/style | SVG style attribute}
   */
  getStyle(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return this.ref.style.getPropertyValue(name);
  }
  /**
   * Sets a single inline style property.
   *
   * @example
   * ```ts
   * el.setStyle('display', 'grid')
   * el.setStyle('opacity', 0.8)
   * ```
   *
   * @param name - The CSS property name (kebab-case recommended).
   * @param value - The CSS property value.
   * @returns This instance for chaining.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link setStyles} for setting/removing specific style properties.
   * @see {@link rmStyle} for removing style properties.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/style | HTMLElement.style}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/setProperty | CSSStyleDeclaration.setProperty}
   */
  setStyle(name, value) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    this.ref.style.setProperty(name, value);
    return this;
  }
  /**
   * Removes one or more inline style properties.
   *
   * @example
   * ```ts
   * el.rmStyle('display')
   * el.rmStyle('display', 'gap')
   * ```
   *
   * @param names - The CSS property names to remove.
   * @returns This instance for chaining.
   * @throws {TypeError} If any property name is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/removeProperty | CSSStyleDeclaration.removeProperty}
   */
  rmStyle(...names) {
    for (const name of names) {
      if (!isStr(name)) {
        throw typeErr("name", "a string", name);
      }
      this.ref.style.removeProperty(name);
    }
    return this;
  }
  /**
   * Sets or removes multiple inline style properties from an object map, or no-ops for nullish input.
   *
   * @remarks
   * - `null` or `undefined`: does nothing and returns `this`
   * - plain object: non-nullish values set properties, `null`/`undefined`/`false` remove properties
   * - anything else: throws `TypeError`
   *
   * @example
   * ```ts
   * el.setStyles({
   *   display: 'grid',
   *   gap: '1rem',
   *   opacity: 0,
   *   color: null,
   * })
   * el.setStyles(null) // no-op
   * ```
   *
   * @param styleMap - Style property map or nullish to skip.
   * @returns This instance for chaining.
   * @throws {TypeError} If `styleMap` is not nullish and not a plain object.
   * @see {@link setStyle} for setting a single style property.
   */
  setStyles(styleMap) {
    if (styleMap == null) {
      return this;
    }
    if (!isObj(styleMap)) {
      throw typeErr(
        "styleMap",
        "a plain object",
        styleMap,
        'Pass null/undefined or an object like { display: "grid" }.'
      );
    }
    try {
      for (const [name, value] of Object.entries(styleMap)) {
        if (value == null || value === false) {
          this.rmStyle(name);
        } else {
          this.setStyle(name, value);
        }
      }
    } catch (cause) {
      throw new Error(`Failed to set some styles from object: ${JSON.stringify(styleMap)}.`, { cause });
    }
    return this;
  }
  /**
   * Gets a data attribute from the element.
   *
   * @example
   * ```ts
   * const value = el.getDataAttr('myKey')
   * ```
   *
   * @param name - The data attribute name (in camelCase).
   * @returns The value of the attribute, or undefined if not set.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset | HTMLElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement/dataset | SVGElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement/dataset | MathMLElement.dataset}
   */
  getDataAttr(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return this.ref.dataset[name];
  }
  /**
   * Checks if a data attribute exists on the element.
   *
   * @example
   * ```ts
   * if (el.hasDataAttr('myKey')) {
   *   // ...
   * }
   * ```
   *
   * @param name - The data attribute name (in camelCase).
   * @returns True if the attribute exists, false otherwise.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset | HTMLElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement/dataset | SVGElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement/dataset | MathMLElement.dataset}
   */
  hasDataAttr(name) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    return hasProp(this.ref.dataset, name);
  }
  /**
   * Sets a single data attribute on the element.
   *
   * @example
   * ```ts
   * el.setDataAttr('myKey', 'myValue')
   * el.setDataAttr('count', 42 as unknown as string)
   * ```
   *
   * @param name - The data attribute name (in camelCase).
   * @param value - The value to assign.
   * @returns This instance for chaining.
   * @throws {TypeError} If `name` is not a string.
   * @see {@link setDataAttrs} for setting multiple data attributes at once.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset | HTMLElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement/dataset | SVGElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement/dataset | MathMLElement.dataset}
   */
  setDataAttr(name, value) {
    if (!isStr(name)) {
      throw typeErr("name", "a string", name);
    }
    this.ref.dataset[name] = value;
    return this;
  }
  /**
   * Sets multiple data attributes from an object, or no-ops for nullish input.
   *
   * @remarks
   * This helper is useful for optional dataset bags in builder APIs.
   * - `null` or `undefined`: does nothing and returns `this`
   * - plain object: sets each data attribute on the element
   * - anything else: throws `TypeError`
   *
   * @example
   * ```ts
   * el.setDataAttrs({ myKey: 'myValue', otherKey: 'otherValue' })
   * el.setDataAttrs(null) // no-op
   * ```
   *
   * @param attributes - Data attributes object or nullish to skip.
   * @returns This instance for chaining.
   * @throws {TypeError} If `attributes` is not nullish and not a plain object.
   * @see {@link setDataAttr} for setting a single data attribute.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset | HTMLElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement/dataset | SVGElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement/dataset | MathMLElement.dataset}
   */
  setDataAttrs(attributes) {
    if (attributes == null) {
      return this;
    }
    if (!isObj(attributes)) {
      throw typeErr(
        "attributes",
        "a plain object",
        attributes,
        'Pass null/undefined or an object like { userId: "42" }.'
      );
    }
    try {
      for (const [name, value] of Object.entries(attributes)) {
        this.setDataAttr(name, value);
      }
    } catch (cause) {
      throw new Error(`Failed to set some data attributes from object: ${JSON.stringify(attributes)}.`, { cause });
    }
    return this;
  }
  /**
   * Removes one or more data attributes from the element.
   *
   * @example
   * ```ts
   * el.rmDataAttr('myKey')  // Remove single
   * el.rmDataAttr('myKey', 'otherKey')  // Remove multiple
   * ```
   *
   * @param names - The data attribute name(s) (in camelCase).
   * @returns This instance for chaining.
   * @throws {TypeError} If any name is not a string.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset | HTMLElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement/dataset | SVGElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement/dataset | MathMLElement.dataset}
   */
  rmDataAttr(...names) {
    for (const name of names) {
      if (!isStr(name)) {
        throw typeErr("name", "a string", name);
      }
      delete this.ref.dataset[name];
    }
    return this;
  }
  /**
   * Removes multiple data attributes from an array of names.
   *
   * @example
   * ```ts
   * el.rmDataAttrs(['myKey', 'otherKey'])
   * ```
   *
   * @param names - The data attribute names to remove (in camelCase).
   * @returns This instance for chaining.
   * @throws {TypeError} If `names` is not an array.
   * @throws {TypeError} If any name in `names` is not a string.
   * @see {@link rmDataAttr} for removing one or more data attributes via rest arguments.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset | HTMLElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement/dataset | SVGElement.dataset}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement/dataset | MathMLElement.dataset}
   */
  rmDataAttrs(names) {
    if (!Array.isArray(names)) {
      throw typeErr("names", "an array", names);
    }
    return this.rmDataAttr(...names);
  }
};
var COMMON_SVG_TAGS = ["svg", "rect", "circle", "line", "path", "text"];
var COMMON_MATHML_TAGS = ["math", "mi", "mn", "mo", "mtext"];
var JJHE = class _JJHE extends JJEx {
  /**
   * Creates a JJHE instance from an HTMLElement reference.
   *
   * @remarks
   * Use {@link JJHE.create} to create new HTMLElements, or use this method to wrap existing ones.
   * For other element types, use {@link JJSE.from} for SVGElements or {@link JJME.from} for MathMLElements.
   *
   * @example
   * ```ts
   * const el = JJHE.from(document.getElementById('my-id'))  // from an existing HTMLElement
   * const el = JJHE.from(new document.createElement('div')) // from a new HTMLElement
   * ```
   *
   * @param ref - The HTMLElement.
   * @returns A new JJHE instance.
   */
  static from(ref) {
    return new _JJHE(ref);
  }
  static create(tagName, options) {
    if (!isStr(tagName)) {
      throw typeErr("tagName", "a string like 'div' or 'button'", tagName, "Pass a valid HTML tag name.");
    }
    if (COMMON_SVG_TAGS.includes(tagName)) {
      throw errMsg(
        `tagName`,
        `a HTML tag name (not an SVG tag name)`,
        tagName,
        `Use JJSE.create("${tagName}") for SVG elements.`
      );
    }
    if (COMMON_MATHML_TAGS.includes(tagName)) {
      throw errMsg(
        `tagName`,
        `a HTML tag name (not a MathML tag name)`,
        tagName,
        `Use JJME.create("${tagName}") for MathML elements.`
      );
    }
    return new _JJHE(document.createElement(tagName, options));
  }
  /**
   * Builds an HTML element tree with optional attributes and children.
   *
   * @remarks
   * A concise declarative way to build HTML DOM snippets. Chain further JJ methods on the return value.
   * Pass `null` or omit `attributes` when no attributes are needed. Pass children as additional arguments.
   * Unlike `create()`, the return type is always `JJHE` (not the specific subtype), which is fine for
   * snippet construction where precise inference is not needed.
   *
   * If you prefer a shorter alias compatible with hyperscript conventions, you can use:
   * ```ts
   * const h = JJHE.tree
   * ```
   *
   * @example
   * ```ts
   * // Simple element with text
   * JJHE.tree('p', { class: 'intro' }, 'Hello World')
   *
   * // Nested structure
   * JJHE.tree('nav', { class: 'main-nav' },
   *   JJHE.tree('a', { href: '/' }, 'Home'),
   *   JJHE.tree('a', { href: '/about' }, 'About'),
   * )
   *
   * // No attributes
   * JJHE.tree('section', null, JJHE.tree('h1', null, 'Title'), JJHE.tree('p', null, 'Body'))
   * ```
   *
   * @param tagName - The HTML tag name.
   * @param attributes - Attributes to set. Pass `null` or `undefined` to skip.
   * @param children - Children to append (strings, nodes, or JJ wrappers).
   * @returns A new JJHE instance.
   * @throws {TypeError} If `attributes` is not a plain object.
   * @see {@link JJHE.create} for a type-narrowed single-element factory.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement | document.createElement}
   */
  static tree(tagName, attributes, ...children) {
    return _JJHE.create(tagName).setAttrs(attributes).addChild(...children);
  }
  /**
   * Creates an instance of JJHE.
   *
   * @param ref - The HTMLElement to wrap.
   * @throws {TypeError} If `ref` is not an HTMLElement.
   * @see {@link JJHE.from} to wrap existing HTMLElements
   * @see {@link JJHE.create} to create new HTMLElements
   */
  constructor(ref) {
    if (!isInstance(ref, HTMLElement)) {
      throw typeErr("ref", "an HTMLElement", ref, "Use JJHE.from() or JJHE.create().");
    }
    super(ref);
  }
  /**
   * Gets the value property of the HTMLElement (e.g. for inputs).
   *
   * @returns The value.
   * @throws {Error} If the HTMLElement does not have a value property.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/value | HTMLInputElement.value}
   */
  getValue() {
    if (!hasProp(this.ref, "value")) {
      throw new ReferenceError(`${this.ref.tagName} has no value property.`);
    }
    return this.ref.value;
  }
  /**
   * Sets the value property of the HTMLElement.
   *
   * @example
   * ```ts
   * input.setValue('new value')
   * input.setValue(42)  // Numbers are automatically converted
   * ```
   *
   * @param value - The value to set.
   * @returns This instance for chaining.
   * @throws {Error} If the HTMLElement does not have a value property.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/value | HTMLInputElement.value}
   */
  setValue(value) {
    if (!hasProp(this.ref, "value")) {
      throw new ReferenceError(`${this.ref.tagName} has no value property.`);
    }
    this.ref.value = value;
    return this;
  }
  /**
   * Focuses the HTMLElement.
   *
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus | HTMLElement.focus}
   */
  focus() {
    this.ref.focus();
    return this;
  }
  /**
   * Clicks the HTMLElement.
   *
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/click | HTMLElement.click}
   */
  click() {
    this.ref.click();
    return this;
  }
};
var JJT = class _JJT extends JJN {
  /**
   * Creates a JJT instance from a Text node.
   *
   * @remarks
   * Use {@link JJT.create} to create a Text node from a string.
   * For other Node types, use {@link JJN.from} or the specific wrapper type.
   *
   * @example
   * ```ts
   * const textNode = document.createTextNode('foo')
   * const text = JJT.from(textNode)
   * ```
   *
   * @param text - The Text node.
   * @returns A new JJT instance.
   * @throws {TypeError} If `text` is not a Text node.
   * @see {@link JJT.create} for creating from string input.
   */
  static from(text) {
    return new _JJT(text);
  }
  /**
   * Creates a JJT instance from a string.
   *
   * @param text - The string to convert into a Text node.
   * @returns A new JJT instance wrapping a Text node.
   * @see {@link JJT.from} for wrapping an existing Text node.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createTextNode | document.createTextNode}
   */
  static create(text) {
    return new _JJT(document.createTextNode(toStr(text)));
  }
  /**
   * Creates an instance of JJT.
   *
   * @example
   * ```ts
   * const text = new JJT('Hello World')
   * ```
   *
   * @param ref - The Text node or a string to create a Text node from.
   * @throws {TypeError} If `ref` is not a Text node or string.
   * @see {@link JJT.from} for wrapping an existing Text node.
   * @see {@link JJT.create} for creating from a plain string.
   */
  constructor(ref) {
    if (!isInstance(ref, Text)) {
      throw typeErr(
        "ref",
        "a Text node",
        ref,
        "Create a Text node with JJT.create() or document.createTextNode('text')."
      );
    }
    super(ref);
  }
  /**
   * Gets the text content of the Text node.
   *
   * @example
   * ```ts
   * const content = text.getText()
   * ```
   *
   * @returns The text content.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent | Node.textContent}
   */
  getText() {
    return this.ref.textContent;
  }
  /**
   * Sets the text content of the Text node.
   *
   * @example
   * ```ts
   * text.setText('New content')
   * ```
   *
   * @param text - The text to set. Set it to null or undefined to remove all text
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent | Node.textContent}
   */
  setText(text) {
    this.ref.textContent = text;
    return this;
  }
  /**
   * Appends text to the existing content.
   *
   * @example
   * ```ts
   * text.setText('hello')
   * text.addText(' world')
   * console.log(text.getText()) // 'hello world'
   * ```
   *
   * @param textArr - The string to add to the existing contents. If null or undefined, nothing is added.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent | Node.textContent}
   */
  addText(...textArr) {
    this.setText(this.getText() + textArr.join(""));
    return this;
  }
  /**
   * Clears the text content of the Text node.
   *
   * @example
   * ```ts
   * text.empty()
   * ```
   *
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent | Node.textContent}
   */
  empty() {
    return this.setText("");
  }
};
var JJD = class _JJD extends JJNx {
  /**
   * Creates a JJD instance from a Document reference.
   *
   * @remarks
   * Typically, you'll use this to wrap the global `document` object.
   * Use {@link JJHE.from} to wrap individual elements, and {@link JJHE} for the head/body elements.
   *
   * @example
   * ```ts
   * const doc = JJD.from(document)
   * ```
   *
   * @param ref - The Document instance.
   * @returns A new JJD instance.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document | Document}
   */
  static from(ref) {
    return new _JJD(ref);
  }
  /**
   * Creates an instance of JJD.
   *
   * @param ref - The Document instance to wrap.
   * @throws {TypeError} If `ref` is not a Document.
   * @see {@link JJD.from} to wrap a Document
   */
  constructor(ref) {
    if (!isInstance(ref, Document)) {
      throw typeErr("ref", "a Document instance", ref, "Use JJD.from(document) to create an instance.");
    }
    super(ref);
  }
};
var JJME = class _JJME extends JJEx {
  /**
   * Creates a JJME instance from a MathMLElement reference.
   *
   * @remarks
   * Use {@link JJME.create} to create new MathMLElements, or use this method to wrap existing ones.
   * For HTMLElements, use {@link JJHE.from}, or {@link JJSE.from} for SVGElements.
   *
   * @example
   * ```ts
   * const mrow = JJME.from(myMrow)
   * ```
   *
   * @param ref - The MathMLElement.
   * @returns A new JJME instance.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MathMLElement | MathMLElement}
   */
  static from(ref) {
    return new _JJME(ref);
  }
  static create(tagName, options) {
    if (!isStr(tagName)) {
      throw typeErr(
        "tagName",
        'a string like "math" or "mfrac"',
        tagName,
        'Pass a valid MathML tag name like "math", "mrow", or "mfrac".'
      );
    }
    const element = document.createElementNS(MATHML_NS, tagName, options);
    return new _JJME(element);
  }
  /**
   * Builds a MathML element tree with optional attributes and children.
   *
   * @remarks
   * A concise declarative way to build MathML DOM snippets. All elements are created in the MathML namespace.
   * Chain further JJ methods on the return value. Pass `null` or omit `attributes` when no attributes are needed.
   *
   * If you prefer a shorter alias compatible with hyperscript conventions, you can use:
   * ```ts
   * const h = JJME.tree
   * ```
   *
   * @example
   * ```ts
   * // Fraction: x/y
   * JJME.tree('math', null,
   *   JJME.tree('mfrac', null,
   *     JJME.tree('mi', null, 'x'),
   *     JJME.tree('mi', null, 'y'),
   *   ),
   * )
   *
   * // Subscript: a_n
   * JJME.tree('math', null,
   *   JJME.tree('msub', null,
   *     JJME.tree('mi', null, 'a'),
   *     JJME.tree('mi', null, 'n'),
   *   ),
   * )
   * ```
   *
   * @param tagName - The MathML tag name.
   * @param attributes - Attributes to set. Pass `null` or `undefined` to skip.
   * @param children - Children to append (strings, nodes, or JJ wrappers).
   * @returns A new JJME instance.
   * @throws {TypeError} If `attributes` is not a plain object.
   * @see {@link JJME.create} for a type-narrowed single-element factory.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createElementNS | document.createElementNS}
   */
  static tree(tagName, attributes, ...children) {
    return _JJME.create(tagName).setAttrs(attributes).addChild(...children);
  }
  /**
   * Creates an instance of JJME.
   *
   * @param ref - The MathMLElement to wrap.
   * @throws {TypeError} If `ref` is not a MathMLElement.
   * @see {@link JJME.from} to wrap existing MathMLElements
   * @see {@link JJME.create} to create new MathMLElements
   */
  constructor(ref) {
    if (!isInstance(ref, Element) || ref.namespaceURI !== MATHML_NS) {
      throw typeErr("ref", `a MathML element (${MATHML_NS})`, ref, "Use JJME.from() or JJME.create().");
    }
    super(ref);
  }
};
var JJSE = class _JJSE extends JJEx {
  /**
   * Creates a JJSE instance from an SVGElement reference.
   *
   * @remarks
   * Use {@link JJSE.create} to create new SVGElements, or use this method to wrap existing ones.
   * For HTMLElements, use {@link JJHE.from}, or {@link JJME.from} for MathMLElements.
   *
   * @example
   * ```ts
   * const svg = JJSE.from(myCircle)
   * ```
   *
   * @param ref - The SVGElement.
   * @returns A new JJSE instance.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement | SVGElement}
   */
  static from(ref) {
    return new _JJSE(ref);
  }
  static create(tagName, options) {
    if (!isStr(tagName)) {
      throw typeErr(
        "tagName",
        'a string like "circle" or "path"',
        tagName,
        'Pass a valid SVG tag name like "svg", "circle", or "path".'
      );
    }
    const element = document.createElementNS(SVG_NS, tagName, options);
    return new _JJSE(element);
  }
  /**
   * Builds an SVG element tree with optional attributes and children.
   *
   * @remarks
   * A concise declarative way to build SVG DOM snippets. All elements are created in the SVG namespace.
   * Chain further JJ methods on the return value. Pass `null` or omit `attributes` when no attributes are needed.
   *
   * If you prefer a shorter alias compatible with hyperscript conventions, you can use:
   * ```ts
   * const h = JJSE.tree
   * ```
   *
   * @example
   * ```ts
   * // Simple SVG icon
   * JJSE.tree('svg', { viewBox: '0 0 24 24', width: '24', height: '24' },
   *   JJSE.tree('circle', { cx: '12', cy: '12', r: '10', fill: 'currentColor' }),
   * )
   *
   * // No attributes
   * JJSE.tree('g', null, JJSE.tree('rect', { x: '0', y: '0', width: '10', height: '10' }))
   * ```
   *
   * @param tagName - The SVG tag name.
   * @param attributes - Attributes to set. Pass `null` or `undefined` to skip.
   * @param children - Children to append (strings, nodes, or JJ wrappers).
   * @returns A new JJSE instance.
   * @throws {TypeError} If `attributes` is not a plain object.
   * @see {@link JJSE.create} for a type-narrowed single-element factory.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/createElementNS | document.createElementNS}
   */
  static tree(tagName, attributes, ...children) {
    return _JJSE.create(tagName).setAttrs(attributes).addChild(...children);
  }
  /**
   * Creates an instance of JJSE.
   *
   * @param ref - The SVGElement to wrap.
   * @throws {TypeError} If `ref` is not an SVGElement.
   * @see {@link JJSE.from} to wrap an existing SVG element.
   * @see {@link JJSE.create} to create a new SVG element.
   */
  constructor(ref) {
    if (!isInstance(ref, SVGElement)) {
      throw typeErr(
        "ref",
        "an SVGElement",
        ref,
        'Wrap an existing SVG element with JJSE.from(el) or create one with JJSE.create("svg").'
      );
    }
    super(ref);
  }
  /**
   * Sets the fill attribute.
   *
   * @param value - The fill color/value.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill | fill}
   */
  setFill(value) {
    return this.setAttr("fill", value);
  }
  /**
   * Sets the stroke attribute.
   *
   * @param value - The stroke color/value.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke | stroke}
   */
  setStroke(value) {
    return this.setAttr("stroke", value);
  }
  /**
   * Sets the stroke-width attribute.
   *
   * @param value - The width.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-width | stroke-width}
   */
  setStrokeWidth(value) {
    return this.setAttr("stroke-width", String(value));
  }
  /**
   * Sets the viewBox attribute.
   *
   * @example
   * ```ts
   * svg.setViewBox(0, 0, 100, 100)
   * svg.setViewBox('0 0 100 100')
   * ```
   *
   * @param p1 - Min-x or string/array value.
   * @param p2 - Min-y.
   * @param p3 - Width.
   * @param p4 - Height.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/viewBox | viewBox}
   */
  setViewBox(p1, p2, p3, p4) {
    if (isNum(p1) && isNum(p2) && isNum(p3) && isNum(p4)) {
      return this.setAttr("viewBox", `${p1} ${p2} ${p3} ${p4}`);
    }
    const value = p1;
    return this.setAttr("viewBox", Array.isArray(value) ? value.join(" ") : value);
  }
  /**
   * Sets the width attribute.
   *
   * @param value - The width.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/width | width}
   */
  setWidth(value) {
    return this.setAttr("width", String(value));
  }
  /**
   * Sets the height attribute.
   *
   * @param value - The height.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/height | height}
   */
  setHeight(value) {
    return this.setAttr("height", String(value));
  }
  /**
   * Sets the d attribute (path data).
   *
   * @param value - The path data string or array of segments.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d | d}
   */
  setD(value) {
    return this.setAttr("d", Array.isArray(value) ? value.join(" ") : value);
  }
  /**
   * Sets the transform attribute.
   *
   * @param value - The transform string.
   * @returns This instance for chaining.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform | transform}
   */
  setTransform(value) {
    return this.setAttr("transform", value);
  }
};
JJN.wrap = function wrap(raw) {
  if (raw && typeof raw === "object") {
    if (isInstance(raw, JJN)) {
      return raw;
    }
    if (isInstance(raw, HTMLElement)) {
      return JJHE.from(raw);
    }
    if (isInstance(raw, SVGElement)) {
      return JJSE.from(raw);
    }
    if (isInstance(raw, MathMLElement)) {
      return JJME.from(raw);
    }
    if (isInstance(raw, Element)) {
      return JJE.from(raw);
    }
    if (isInstance(raw, ShadowRoot)) {
      return JJSR.from(raw);
    }
    if (isInstance(raw, DocumentFragment)) {
      return JJDF.from(raw);
    }
    if (isInstance(raw, Document)) {
      return JJD.from(raw);
    }
    if (isInstance(raw, Text)) {
      return JJT.from(raw);
    }
    if (isInstance(raw, Node)) {
      return JJN.from(raw);
    }
  }
  return JJT.create(String(raw));
};
async function fetchText(url, mime = "text/*") {
  if (!isStr(mime)) {
    throw typeErr("mime", "a string", mime);
  }
  const response = await fetch(url, { headers: { Accept: mime } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
async function fetchTemplate(url) {
  try {
    const htmlStr = await fetchText(url, "text/html");
    return JJDF.from(document.createRange().createContextualFragment(htmlStr));
  } catch (err) {
    throw new Error(`Failed to fetch or process HTML from ${url}`, { cause: err });
  }
}
async function fetchStyle(url) {
  try {
    const sheet = new CSSStyleSheet();
    return await sheet.replace(await fetchText(url, "text/css"));
  } catch (err) {
    throw new Error(`Failed to fetch or convert CSS string to CSSStyleSheet from ${url}`, { cause: err });
  }
}
function attr2prop(instance, name, oldValue, newValue) {
  if (!isInstance(instance, HTMLElement)) {
    throw typeErr(
      "instance",
      "an HTMLElement",
      instance,
      "Call attr2prop(this, ...) from attributeChangedCallback on a custom element instance."
    );
  }
  if (oldValue !== newValue) {
    try {
      const propName = keb2cam(name);
      if (hasProp(instance, propName)) {
        instance[propName] = newValue;
        return true;
      }
    } catch (err) {
      throw new Error(
        `Failed to set property using attribute change event ${name}. Old value: ${oldValue}, New value: ${newValue}.`,
        { cause: err }
      );
    }
  }
  return false;
}
async function defineComponent(name, constructor, options) {
  if (!isStr(name)) {
    throw typeErr("name", "a string", name, 'Pass a valid name like "my-component".');
  }
  if (!name.includes("-")) {
    throw new SyntaxError(
      errMsg("name", "a custom-element name containing a hyphen", name, 'Use kebab-case like "my-component".')
    );
  }
  if (typeof constructor !== "function") {
    throw typeErr(
      "constructor",
      "a function",
      constructor,
      'Pass the custom element class itself, e.g. defineComponent("my-component", MyComponent).'
    );
  }
  const definedConstructor = customElements.get(name);
  if (definedConstructor) {
    if (definedConstructor !== constructor) {
      throw new ReferenceError(`A different constructor is already defined for the custom element "${name}".`);
    }
  } else {
    customElements.define(name, constructor, options);
    await customElements.whenDefined(name);
  }
  return Boolean(definedConstructor);
}
export {
  JJD,
  JJDF,
  JJE,
  JJET,
  JJHE,
  JJME,
  JJN,
  JJSE,
  JJSR,
  JJT,
  attr2prop,
  defineComponent,
  fetchStyle,
  fetchTemplate
};
