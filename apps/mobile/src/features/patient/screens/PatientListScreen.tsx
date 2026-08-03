import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SearchBar } from '@breeyo/ui';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { PatientSearchResults } from '../components/PatientSearchResults';
import { RecentPatientsList } from '../components/RecentPatientsList';

export function PatientListScreen() {
  const router = useRouter();
  const {
    searchTerm,
    setSearchTerm,
    debouncedTerm,
    results,
    isSearching,
  } = usePatientSearch();
  const [refreshing, setRefreshing] = useState(false);

  const isSearchMode = searchTerm.length >= 2;

  const handleSelectPet = useCallback(
    (petId: string) => {
      router.push(`/(app)/patients/${petId}` as any);
    },
    [router],
  );

  const handleAddPatient = useCallback(() => {
    router.push('/(app)/register-patient' as any);
  }, [router]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // RecentPatientsList handles its own refetch; we just toggle the indicator
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container} testID="patient-list-screen">
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineLarge" style={styles.title}>
          Patients
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search by name, mobile, or pet name"
          testID="patient-search-bar"
        />
      </View>

      {/* Search loading indicator */}
      {isSearching && (
        <View style={styles.searchingIndicator}>
          <ActivityIndicator size="small" color="#2E7D32" />
          <Text variant="bodySmall" style={styles.searchingText}>
            Searching...
          </Text>
        </View>
      )}

      {/* Content area */}
      <View style={styles.content}>
        {isSearchMode ? (
          <PatientSearchResults
            results={results}
            searchTerm={debouncedTerm}
            isSearching={isSearching}
            onSelectPet={handleSelectPet}
            testID="patient-search-results"
          />
        ) : (
          <RecentPatientsList
            onSelectPet={handleSelectPet}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            testID="recent-patients-list"
          />
        )}
      </View>

      {/* FAB */}
      <FAB
        icon="plus"
        label="Add Patient"
        onPress={handleAddPatient}
        style={styles.fab}
        color="#FFFFFF"
        testID="add-patient-fab"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1B1F',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  searchingText: {
    color: '#49454F',
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#2E7D32',
  },
});
