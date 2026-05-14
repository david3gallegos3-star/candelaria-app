import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useWillChange } from 'motion/react';

// ── Constants ────────────────────────────────────────────
const stiffness = 400;
const damping   = 30;
const MIN_WIDTH = 691;
const MAX_HEIGHT_MOBILE_ULTRA   = 400;
const MAX_HEIGHT_MOBILE_MASSIVE = 700;
const min = (a, b) => (a < b ? a : b);

export const SIZE_PRESETS = {
  RESET:            'reset',
  EMPTY:            'empty',
  DEFAULT:          'default',
  COMPACT:          'compact',
  COMPACT_LONG:     'compactLong',
  LARGE:            'large',
  LONG:             'long',
  MINIMAL_LEADING:  'minimalLeading',
  MINIMAL_TRAILING: 'minimalTrailing',
  COMPACT_MEDIUM:   'compactMedium',
  MEDIUM:           'medium',
  TALL:             'tall',
  ULTRA:            'ultra',
  MASSIVE:          'massive',
};

export const DynamicIslandSizePresets = {
  reset:           { width: 150,  aspectRatio: 1,          borderRadius: 20 },
  empty:           { width: 0,    aspectRatio: 0,          borderRadius: 0  },
  default:         { width: 150,  aspectRatio: 44 / 150,   borderRadius: 46 },
  minimalLeading:  { width: 52.33,aspectRatio: 44 / 52.33, borderRadius: 22 },
  minimalTrailing: { width: 52.33,aspectRatio: 44 / 52.33, borderRadius: 22 },
  compact:         { width: 235,  aspectRatio: 44 / 235,   borderRadius: 46 },
  compactLong:     { width: 300,  aspectRatio: 44 / 235,   borderRadius: 46 },
  compactMedium:   { width: 351,  aspectRatio: 64 / 371,   borderRadius: 44 },
  long:            { width: 371,  aspectRatio: 84 / 371,   borderRadius: 42 },
  medium:          { width: 371,  aspectRatio: 210 / 371,  borderRadius: 22 },
  large:           { width: 371,  aspectRatio: 84 / 371,   borderRadius: 42 },
  tall:            { width: 371,  aspectRatio: 210 / 371,  borderRadius: 42 },
  ultra:           { width: 630,  aspectRatio: 630 / 800,  borderRadius: 42 },
  massive:         { width: 891,  height: 1900, aspectRatio: 891 / 891, borderRadius: 42 },
};

// ── Reducer ──────────────────────────────────────────────
const initialBlobState = (initialSize) => ({
  size:           initialSize,
  previousSize:   SIZE_PRESETS.EMPTY,
  animationQueue: [],
  isAnimating:    false,
});

function blobReducer(state, action) {
  switch (action.type) {
    case 'SET_SIZE':
      return { ...state, size: action.newSize, previousSize: state.size, isAnimating: false };
    case 'SCHEDULE_ANIMATION':
      return { ...state, animationQueue: action.animationSteps, isAnimating: action.animationSteps.length > 0 };
    case 'INITIALIZE':
      return { ...state, size: action.firstState, previousSize: SIZE_PRESETS.EMPTY, isAnimating: false };
    case 'ANIMATION_END':
      return { ...state, isAnimating: false };
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────
export const BlobContext = createContext(undefined);

export function DynamicIslandProvider({ children, initialSize = SIZE_PRESETS.DEFAULT, initialAnimation = [] }) {
  const [state, dispatch] = useReducer(blobReducer, initialBlobState(initialSize));

  useEffect(() => {
    if (state.animationQueue.length === 0) return;
    const processQueue = async () => {
      for (const step of state.animationQueue) {
        await new Promise(resolve => setTimeout(resolve, step.delay));
        dispatch({ type: 'SET_SIZE', newSize: step.size });
      }
      dispatch({ type: 'ANIMATION_END' });
    };
    processQueue();
  }, [state.animationQueue]);

  const setSize = useCallback((newSize) => {
    if (state.previousSize !== newSize && newSize !== state.size) {
      dispatch({ type: 'SET_SIZE', newSize });
    }
  }, [state.previousSize, state.size]);

  const scheduleAnimation = useCallback((animationSteps) => {
    dispatch({ type: 'SCHEDULE_ANIMATION', animationSteps });
  }, []);

  return (
    <BlobContext.Provider value={{ state, dispatch, setSize, scheduleAnimation, presets: DynamicIslandSizePresets }}>
      {children}
    </BlobContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────
export function useDynamicIslandSize() {
  const context = useContext(BlobContext);
  if (!context) throw new Error('useDynamicIslandSize must be used within a DynamicIslandProvider');
  return context;
}

export function useScheduledAnimations(animations) {
  const { scheduleAnimation } = useDynamicIslandSize();
  const animationsRef = useRef(animations);
  useEffect(() => { scheduleAnimation(animationsRef.current); }, [scheduleAnimation]);
}

// ── Helpers ───────────────────────────────────────────────
function calculateDimensions(size, screenSize, currentSize) {
  if (size === 'massive' && screenSize === 'mobile') return { width: '350px', height: MAX_HEIGHT_MOBILE_MASSIVE };
  if (size === 'ultra'   && screenSize === 'mobile') return { width: '350px', height: MAX_HEIGHT_MOBILE_ULTRA };
  const width = min(currentSize.width, MIN_WIDTH);
  return { width: `${width}px`, height: currentSize.aspectRatio * width };
}

// ── DynamicIsland ─────────────────────────────────────────
function DynamicIslandContent({ children, id, willChange, screenSize, ...props }) {
  const { state, presets } = useDynamicIslandSize();
  const currentSize  = presets[state.size];
  const dimensions   = calculateDimensions(state.size, screenSize, currentSize);

  return (
    <motion.div
      id={id}
      style={{
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#000',
        border: '1px solid rgba(0,0,0,0.1)',
        overflow: 'hidden',
        willChange,
      }}
      animate={{
        width:        dimensions.width,
        height:       dimensions.height,
        borderRadius: currentSize.borderRadius,
        transition:   { type: 'spring', stiffness, damping },
      }}
      {...props}
    >
      <AnimatePresence>{children}</AnimatePresence>
    </motion.div>
  );
}

export function DynamicIsland({ children, id, ...props }) {
  const willChange = useWillChange();
  const [screenSize, setScreenSize] = useState('desktop');

  useEffect(() => {
    const handle = () => {
      if (window.innerWidth <= 640)       setScreenSize('mobile');
      else if (window.innerWidth <= 1024) setScreenSize('tablet');
      else                                setScreenSize('desktop');
    };
    handle();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return (
    <div style={{ zIndex: 10, display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'center', background: 'transparent' }}>
      <DynamicIslandContent id={id} willChange={willChange} screenSize={screenSize} {...props}>
        {children}
      </DynamicIslandContent>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────
export function DynamicContainer({ style, children }) {
  const willChange = useWillChange();
  const { state: { size, previousSize } } = useDynamicIslandSize();
  const isSizeChanged = size !== previousSize;

  return (
    <motion.div
      initial={{ opacity: size === previousSize ? 1 : 0, scale: size === previousSize ? 1 : 0.9, y: size === previousSize ? 0 : 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness, damping, duration: isSizeChanged ? 0.5 : 0.8 }}
      exit={{ opacity: 0, filter: 'blur(10px)', scale: 0.95, y: 20 }}
      style={{ willChange, ...style }}
    >
      {children}
    </motion.div>
  );
}

export function DynamicDiv({ style, children }) {
  const willChange = useWillChange();
  const { state: { size, previousSize } } = useDynamicIslandSize();

  return (
    <motion.div
      initial={{ opacity: size === previousSize ? 1 : 0, scale: size === previousSize ? 1 : 0.9 }}
      animate={{ opacity: size === previousSize ? 0 : 1, scale: size === previousSize ? 0.9 : 1, transition: { type: 'spring', stiffness, damping } }}
      exit={{ opacity: 0, filter: 'blur(10px)', scale: 0 }}
      style={{ willChange, ...style }}
    >
      {children}
    </motion.div>
  );
}

export function DynamicTitle({ style, children }) {
  const willChange = useWillChange();
  const { state: { size, previousSize } } = useDynamicIslandSize();

  return (
    <motion.h3
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: size === previousSize ? 0 : 1, scale: size === previousSize ? 0.9 : 1, transition: { type: 'spring', stiffness, damping } }}
      style={{ willChange, margin: 0, ...style }}
    >
      {children}
    </motion.h3>
  );
}

export function DynamicDescription({ style, children }) {
  const willChange = useWillChange();
  const { state: { size, previousSize } } = useDynamicIslandSize();

  return (
    <motion.p
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: size === previousSize ? 0 : 1, scale: size === previousSize ? 0.9 : 1, transition: { type: 'spring', stiffness, damping } }}
      style={{ willChange, margin: 0, ...style }}
    >
      {children}
    </motion.p>
  );
}

export default DynamicIsland;
