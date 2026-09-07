import React, { useState, useEffect, useRef } from 'react';

const DebouncedInput = ({
  value = '',
  onChange,
  debounceMs = 500,
  type = 'text',
  id,
  placeholder,
  className = '',
  min,
  max,
  ...rest
}) => {
  const [localValue, setLocalValue] = useState(value);
  const debounceTimerRef = useRef(null);

  // Sync internal state and cancel pending debounce when external value changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setLocalValue(value);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onChange(newValue);
    }, debounceMs);
  };

  return (
    <input
      id={id}
      type={type}
      min={min}
      max={max}
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  );
};

export default DebouncedInput;
