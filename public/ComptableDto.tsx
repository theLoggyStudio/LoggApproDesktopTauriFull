import { useState } from "react";

export default function ComptableDto() {
  const [comptables, setComptables] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/comptables');
    const data = await response.json();
    setComptables(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/comptables/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newComptable) => {
    await fetch('https://api.elephantsql.com/api/comptables', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newComptable)
    });
  }

  const update = async (id, updatedComptable) => {
    await fetch(`https://api.elephantsql.com/api/comptables/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedComptable)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/comptables/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
