function getStatusWeight(status) {
  switch (status) {
    case null:
    case undefined:
    case 'unused':
      return 0;
    case 'found':
      return 1;
    default:
      return 2;
  }
}

function combineStatus(debugStatus, unwindStatus) {
  const debugWeight = getStatusWeight(debugStatus);
  const unwindWeight = getStatusWeight(unwindStatus);

  const combined = debugWeight >= unwindWeight ? debugStatus : unwindStatus;
  return combined || 'unused';
}

export {combineStatus};
