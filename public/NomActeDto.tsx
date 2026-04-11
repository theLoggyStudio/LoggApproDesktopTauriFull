import { useState } from "react";

export default function NomActeDto() {
  const [nomActes, setNomActes] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/nomActes');
    const data = await response.json();
    setNomActes(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/nomActes/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newNomActe) => {
    await fetch('https://api.elephantsql.com/api/nomActes', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newNomActe)
    });
  }

  const update = async (id, updatedNomActe) => {
    await fetch(`https://api.elephantsql.com/api/nomActes/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedNomActe)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/nomActes/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
