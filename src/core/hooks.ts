/* eslint-disable no-param-reassign */

/*
 * Tools for one parts of the application to communicate with others though DOM nodes.
 *
 * Warning! These lifecycle hooks work only when you use `mount` and `unmount` functions instead of manual DOM attaching/detaching.
 */

import { BehaviorSubject, Observable } from 'rxjs';
import { listen, unlisten } from './dom'; // eslint-disable-line import/no-cycle
import { MaybeObservable } from './types';

interface Lifecycle {
  mount?: Array<() => void>;
  unmount?: Array<() => void>;
  // Used only to keep the last lifecycle action (mount/unmount). Don't use to check whether an element is mounted to the DOM!
  isMountTriggered?: boolean;
}

interface Hooks {
  interface?: unknown;
  lifecycle?: Lifecycle;
}

export interface WithInterfaceHook<TInterface> {
  __interface_dont_use_or_you_are_fired: TInterface;
}

const nodesHooks = new WeakMap<Node, Hooks>();

if (process.env.NODE_ENV !== 'production') {
  (window as any).nodesHooks = nodesHooks;
}

function ensureWithHooks(base: Node): Hooks {
  let hooks = nodesHooks.get(base);

  if (hooks === undefined) {
    hooks = {};
    nodesHooks.set(base, hooks);
  }

  return hooks;
}

function ensureWithLifecycle(base: Node): Lifecycle {
  const hooks = ensureWithHooks(base);

  if (hooks.lifecycle) {
    return hooks.lifecycle;
  }

  const lifecycle = {};
  hooks.lifecycle = lifecycle;
  return lifecycle;
}

/**
 * Attaches an object for a custom methods and properties
 *
 * @example
 * // Important to return the result to tell TS that the element has an interface with specific type
 * return useInterface(element, {
 *   foo() {},
 * });
 * getInterface(elementWithInterface).foo();
 */
export function useInterface<TBase extends Node, TInterface>(base: TBase, object: TInterface) {
  const hooks = ensureWithHooks(base);
  hooks.interface = object;
  return base as Exclude<TBase, WithInterfaceHook<any>> & WithInterfaceHook<TInterface>;
}

/**
 * Gets the attached object (see useInterface). If not attached, returns undefined.
 */
export function getInterface<TBase extends Node>(base: TBase): TBase extends WithInterfaceHook<infer TInterface> ? TInterface : undefined {
  return nodesHooks.get(base)?.interface as any;
}

/**
 * Checks attached interface
 */
export function hasInterface<T = unknown>(base: any): base is WithInterfaceHook<T> {
  return nodesHooks.get(base)?.interface !== undefined;
}

/**
 * Attaches a mount event listener to an element.
 * It should be triggered manually.
 *
 * @example
 * let intervalId = 0;
 * const unsubscribe = useOnMount(element, () => {
 *   intervalId = setInterval(() => console.log('tick'), 1000);
 * });
 *
 * // In the real app this function is called by the `mount` and `unmount` functions
 * triggerMount(element);
 */
export function useOnMount(base: Node, onMount: () => void): () => void {
  const lifecycle = ensureWithLifecycle(base);
  lifecycle.mount = lifecycle.mount || [];
  lifecycle.mount.push(onMount);

  return () => {
    const mounts = nodesHooks.get(base)?.lifecycle?.mount;
    if (mounts) {
      const listenerIndex = mounts.indexOf(onMount);
      if (listenerIndex > -1) {
        mounts.splice(listenerIndex, 1);
      }
    }
  };
}

/**
 * Attaches an unmount event listener to an element.
 * It should be triggered manually.
 *
 * @example
 * // ...
 * const unsubscribe = useOnUnmount(element, () => {
 *   clearInterval(intervalId);
 * });
 *
 * // In the real app this function is called by the `unmount` functions
 * triggerUnmount(element);
 */
export function useOnUnmount(base: Node, onUnmount: () => void): () => void {
  const lifecycle = ensureWithLifecycle(base);
  lifecycle.unmount = lifecycle.unmount || [];
  lifecycle.unmount.push(onUnmount);

  return () => {
    const unmounts = nodesHooks.get(base)?.lifecycle?.unmount;
    if (unmounts) {
      const listenerIndex = unmounts.indexOf(onUnmount);
      if (listenerIndex > -1) {
        unmounts.splice(listenerIndex, 1);
      }
    }
  };
}

/**
 * Triggers the mount event listeners on the element (does nothing if there are no listeners or it's already mounted)
 */
export function triggerMount(base: Node) {
  const lifecycle = ensureWithLifecycle(base);
  if (lifecycle.isMountTriggered !== true) {
    lifecycle.isMountTriggered = true;
    if (lifecycle.mount) {
      [...lifecycle.mount].forEach((onMount) => onMount());
    }
  }
}

/**
 * Triggers the unmount event listeners on the element (does nothing if there are no listeners or it's already unmounted)
 */
export function triggerUnmount(base: Node) {
  const lifecycle = ensureWithLifecycle(base);
  if (lifecycle.isMountTriggered !== false) {
    lifecycle.isMountTriggered = false;
    if (lifecycle.unmount) {
      [...lifecycle.unmount].forEach((onUnmount) => onUnmount());
    }
  }
}

/**
 * Returns the last called element lifecycle callback (mount/unmount).
 * Undefined means that no callback was called before.
 * Do not use it to check if the element is mounted to the DOM.
 */
export function isMountTriggered(base: Node): boolean | undefined {
  return nodesHooks.get(base)?.lifecycle?.isMountTriggered;
}

/**
 * Calls the function when the element is mounted and the other function when unmounted.
 * In contrast to useOnMount, also calls the function during hooking if the element is mounted.
 * Call `unsubscribe` to trigger the unmount handler immediately (if the element is mounted) and stop watching for mounting.
 *
 * @example
 * const stop = useWhileMounted(element, () => {
 *   const intervalId = setInterval(() => console.log('tick'), 1000);
 *   return () => clearInterval(intervalId); // Return an unmount listener
 * });
 */
export function useWhileMounted(base: Node, onMount: () => () => void): () => void {
  let onUnmount: (() => void) | undefined;

  function handleMount() {
    onUnmount = onMount();
  }

  function handleUnmount() {
    if (onUnmount) {
      onUnmount();
      onUnmount = undefined;
    }
  }

  const stopWatchMount = useOnMount(base, handleMount);
  const stopWatchUnmount = useOnUnmount(base, handleUnmount);

  if (isMountTriggered(base)) {
    handleMount();
  }

  return () => {
    stopWatchMount();
    stopWatchUnmount();
    handleUnmount();
  };
}

/**
 * Attaches an event listener during the element is mounted.
 * Use it to attach event listener to an object outside the element.
 *
 * @example
 * const stop = useListenWhileMounted(element, window, 'resize', () => {
 *   console.log('Window resized');
 * });
 */
export function useListenWhileMounted<K extends keyof HTMLElementEventMap>(base: Node, target: HTMLElement, event: K, cb: (event: HTMLElementEventMap[K]) => void): () => void; // eslint-disable-line max-len
export function useListenWhileMounted<K extends keyof SVGElementEventMap>(base: Node, target: SVGElement, event: K, cb: (event: SVGElementEventMap[K]) => void): () => void; // eslint-disable-line max-len
export function useListenWhileMounted(base: Node, target: EventTarget, event: string, cb: (event: Event) => void): () => void;
export function useListenWhileMounted(base: Node, target: EventTarget, event: string, cb: (event: Event) => void) {
  return useWhileMounted(base, () => {
    listen(target, event, cb);
    return () => unlisten(target, event, cb);
  });
}

/**
 * Listens to the Observable data change during the element is mounted.
 * Call `stop` to unsubscribe from the observable immediately and stop watching the mount events.
 *
 * Set `isPureState` to `true` when the callback should be called only when the observable value changes and you are
 * sure that the values are pure (e.g. value1 !== value2 when the value is changed). Otherwise set to `false`, e.g. when
 * the callback must be called on every emit.
 *
 * @example
 * const stop = useObservable(element, observable, true, (value) => {
 *   element.foo = value;
 * });
 */
export function useObservable<T>(
  base: Node,
  observable: Observable<T>,
  isPureState = false,
  onChange: (newValue: T) => void,
) {
  let lastValue: T | undefined;
  let wasEmitted = false;
  const handleEmit = !isPureState ? onChange : ((newValue: T) => {
    if (!wasEmitted || newValue !== lastValue) {
      lastValue = newValue;
      wasEmitted = true;
      onChange(newValue);
    }
  });

  return useWhileMounted(base, () => {
    const subscription = observable.subscribe(handleEmit);
    return () => subscription.unsubscribe();
  });
}

/**
 * Listens to the MaybeObservable value change during the element is mounted
 *
 * See `useObservable` for an information about `isPureState`.
 *
 * Set `lazy` to `false` to force calling `onChange` when the element is mounted
 */
export function useMaybeObservable<T>(
  base: Node,
  value: MaybeObservable<T>,
  isPureState: boolean,
  onChange: (newValue: T) => void,
  lazy = false,
): () => void {
  if (value instanceof Observable) {
    return useObservable(base, value, isPureState, onChange);
  }

  if (lazy && !isMountTriggered(base)) {
    const stopWatchMount = useOnMount(base, () => {
      stopWatchMount();
      onChange(value);
    });
    return stopWatchMount;
  }

  onChange(value);
  return () => {};
}

/**
 * Resolves the value of an observable that emits an observable
 *
 * We need to go deeper...
 */
export function useMaybeObservableMaybeObservable<T, P>(
  base: Node,
  value: MaybeObservable<T>,
  getInner: (subValue: T) => MaybeObservable<P>,
  isPureState: boolean,
  onChange: (newValue: P) => void,
  lazy = false,
): () => void {
  let unsubscribeInner: (() => void) | undefined;

  const unsubscribeOuter = useMaybeObservable(base, value, true, (subValue) => {
    if (unsubscribeInner) {
      unsubscribeInner();
    }
    const innerObservable = getInner(subValue);
    unsubscribeInner = useMaybeObservable(base, innerObservable, isPureState, onChange, lazy);
  }, lazy);

  return () => {
    unsubscribeOuter();
    if (unsubscribeInner) {
      unsubscribeInner();
    }
  };
}

/**
 * Listens to an event outside the hooked element while it's mounted
 */
export function useOutsideEvent<P extends keyof HTMLElementEventMap>(base: HTMLElement, name: P, cb: (event: HTMLElementEventMap[P]) => void) {
  return useListenWhileMounted(base, window, name, (event: HTMLElementEventMap[P]) => {
    if (!base.contains(event.target as HTMLElement)) {
      cb(event);
    }
  });
}

/**
 * Converts a MaybeObservable value to BehaviorSubject (that stores the most recent emitted value).
 * The value is updated while the element is mounted.
 *
 * @link https://stackoverflow.com/a/58834889/1118709 Explanation
 */
export function useToBehaviorSubject<T>(
  base: Node,
  observable: MaybeObservable<T>,
  initial: T,
): [BehaviorSubject<T>, () => void] {
  if (observable instanceof BehaviorSubject) {
    return [observable, () => {}];
  }

  if (observable instanceof Observable) {
    const subject = new BehaviorSubject(initial);
    const stop = useWhileMounted(base, () => {
      const subscription = observable.subscribe((newValue: T) => {
        if (newValue !== subject.value) {
          subject.next(newValue);
        }
      });
      return () => subscription.unsubscribe();
    });
    return [subject, stop];
  }

  return [new BehaviorSubject(initial), () => {}];
}
