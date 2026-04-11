import React, { useEffect, useState } from 'react';
import { useAlert } from '../context/SearchContext';

function Loading({ theFunction }) {
  const [onLoad, setOnLoad] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const { alertObj, setAlertObj } = useAlert();

  useEffect(() => {
    const executeFunction = async () => {
      setOnLoad(true);
      const result = await theFunction();  // Exécution de la fonction
      setResult(result);
      setOnLoad(false);
    };

    executeFunction();
  }, [theFunction]);

  if (onLoad) {
    return (
      <div className="spinner-border text-warning" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      {result} 
    </div>
  );
}

export default Loading;
