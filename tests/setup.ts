import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

afterEach(() => cleanup());

// Component tests render outside AccountSessionProvider. Start with an explicit
// resolved guest identity; account tests override it to exercise their own scope.
import { useAccountStore } from '@/store/useAccountStore';
beforeEach(()=>useAccountStore.setState(state=>({session:{account:null,googleEnabled:false,localSignIn:false,providers:[],connections:[]},status:'ready',epoch:state.epoch+1,jobs:[],assets:[]})));
