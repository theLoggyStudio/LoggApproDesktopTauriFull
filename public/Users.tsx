import { useState } from "react";

export default function UserDto() {
  const [users, setUsers] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/users');
    const data = await response.json();
    setUsers(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/users/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newUser) => {
    await fetch('https://api.elephantsql.com/api/users', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newUser)
    });
  }

  const update = async (id, updatedUser) => {
    await fetch(`https://api.elephantsql.com/api/users/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedUser)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/users/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
